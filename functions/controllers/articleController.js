
const admin = require('firebase-admin');
const db    = admin.firestore();

function serializeDoc(doc) {
  const d = doc.data();
  Object.keys(d).forEach(k => {
    if (d[k]?.toDate) d[k] = d[k].toDate().toISOString();
  });
  return { id: doc.id, ...d };
}

async function fetchAuthor(authorId) {
  const snap = await db.collection('users').doc(authorId).get();
  if (!snap.exists) return { id: authorId, username: 'Deleted User', avatar: '', bio: '' };
  const d = snap.data();
  return { id: snap.id, username: d.username, avatar: d.avatar, bio: d.bio };
}

function readTime(content) {
  return Math.max(1, Math.ceil((content || '').split(/\s+/).length / 200));
}

function autoExcerpt(content) {
  return content.replace(/<[^>]*>/g, '').substring(0, 200) + '…';
}

const getArticles = async (req, res) => {
  try {
    const { tag, authorId, sort = 'newest', page = 1, limit = 9 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));

    let query = db.collection('articles');

    if (tag)      query = query.where('tags', 'array-contains', tag);
    if (authorId) query = query.where('authorId', '==', authorId);

    query = query.orderBy('createdAt', 'desc');

    const countSnap = await query.select().get();
    const total = countSnap.size;

    const offset = (pageNum - 1) * pageSize;
    let dataQuery = query.limit(pageSize);
    if (offset > 0 && countSnap.docs[offset - 1]) {
      dataQuery = query.startAfter(countSnap.docs[offset - 1]).limit(pageSize);
    }

    const snap = await dataQuery.get();
    let articles = snap.docs.map(serializeDoc);

    const search = (req.query.search || '').toLowerCase().trim();
    if (search) {
      articles = articles.filter(a =>
        a.title?.toLowerCase().includes(search) ||
        a.content?.toLowerCase().includes(search) ||
        a.excerpt?.toLowerCase().includes(search)
      );
    }

    const authorIds = [...new Set(articles.map(a => a.authorId))];
    const authorMap = {};
    await Promise.all(authorIds.map(async id => {
      authorMap[id] = await fetchAuthor(id);
    }));
    const commentCounts = await Promise.all(articles.map(async a => {
      if (typeof a.commentCount === 'number') return a.commentCount;
      const cs = await db.collection('articles').doc(a.id).collection('comments').select().get();
      return cs.docs.filter(d => !d.data().parentId).length;
    }));

    articles = articles.map((a, i) => ({
      ...a,
      commentCount: commentCounts[i] || 0,
      author: authorMap[a.authorId] || null,
    }));

    if (sort === 'popular') {
      articles.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    } else if (sort === 'trending') {
      const score = a => ((a.likeCount || 0) * 3) + ((a.commentCount || 0) * 5) + (a.views || 0);
      articles.sort((a, b) => score(b) - score(a));
    }

    res.json({
      articles,
      pagination: { total, page: pageNum, pages: Math.ceil(total / pageSize), limit: pageSize },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const getTags = async (req, res) => {
  try {
    const snap = await db.collection('articles').select('tags').get();
    const tagSet = new Set();
    snap.docs.forEach(d => (d.data().tags || []).forEach(t => tagSet.add(t)));
    res.json([...tagSet].sort());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getArticle = async (req, res) => {
  try {
    const snap = await db.collection('articles').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Article not found' });

    await snap.ref.update({ views: admin.firestore.FieldValue.increment(1) });

    const article = serializeDoc(snap);
    article.author   = await fetchAuthor(article.authorId);
    article.views    = (article.views || 0) + 1;

    const commentsSnap = await snap.ref.collection('comments')
      .orderBy('createdAt', 'asc').get();
    article.comments = commentsSnap.docs.map(serializeDoc);
    article.commentCount = article.comments.filter(c => !c.parentId).length;

    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createArticle = async (req, res) => {
  try {
    const { title, content, excerpt, image, tags } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Title and content are required' });

    const tagArr = tags
      ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [];

    const data = {
      title:    title.trim().slice(0, 150),
      content,
      excerpt:  excerpt?.trim() || autoExcerpt(content),
      image:    image || '',
      tags:     tagArr,
      authorId: req.uid,
      likes:    [],
      likeCount:0,
      views:    0,
      commentCount: 0,
      readTime: readTime(content),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('articles').add(data);
    const created = { id: ref.id, ...data, author: req.userDoc,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateArticle = async (req, res) => {
  try {
    const snap = await db.collection('articles').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Article not found' });
    if (snap.data().authorId !== req.uid)
      return res.status(403).json({ message: 'Not authorized' });

    const { title, content, excerpt, image, tags } = req.body;
    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (title   !== undefined) update.title   = title.trim().slice(0, 150);
    if (content !== undefined) { update.content = content; update.readTime = readTime(content); }
    if (excerpt !== undefined) update.excerpt = excerpt?.trim() || (content ? autoExcerpt(content) : snap.data().excerpt);
    if (image   !== undefined) update.image   = image;
    if (tags    !== undefined) update.tags    = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);

    await snap.ref.update(update);
    const updated = await snap.ref.get();
    res.json({ id: updated.id, ...serializeDoc(updated), author: req.userDoc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const snap = await db.collection('articles').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Article not found' });
    if (snap.data().authorId !== req.uid)
      return res.status(403).json({ message: 'Not authorized' });

    const comments = await snap.ref.collection('comments').get();
    const batch = db.batch();
    comments.docs.forEach(c => batch.delete(c.ref));
    batch.delete(snap.ref);
    await batch.commit();

    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const ref  = db.collection('articles').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'Article not found' });

    const likes  = snap.data().likes || [];
    const liked  = likes.includes(req.uid);
    const update = liked
      ? { likes: admin.firestore.FieldValue.arrayRemove(req.uid), likeCount: admin.firestore.FieldValue.increment(-1) }
      : { likes: admin.firestore.FieldValue.arrayUnion(req.uid),  likeCount: admin.firestore.FieldValue.increment(1)  };

    await ref.update(update);
    res.json({ liked: !liked, likeCount: snap.data().likeCount + (liked ? -1 : 1) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleBookmark = async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.uid);
    const snap    = await userRef.get();
    const bookmarks = snap.data()?.bookmarks || [];
    const bookmarked = bookmarks.includes(req.params.id);

    await userRef.update({
      bookmarks: bookmarked
        ? admin.firestore.FieldValue.arrayRemove(req.params.id)
        : admin.firestore.FieldValue.arrayUnion(req.params.id),
    });
    res.json({ bookmarked: !bookmarked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });

    const articleSnap = await db.collection('articles').doc(req.params.id).get();
    if (!articleSnap.exists) return res.status(404).json({ message: 'Article not found' });

    const comment = {
      content:   content.trim().slice(0, 500),
      authorId:  req.uid,
      username:  req.userDoc?.username || 'Anonymous',
      avatar:    req.userDoc?.avatar   || '',
      parentId:  null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await articleSnap.ref.collection('comments').add(comment);
    await articleSnap.ref.update({ commentCount: admin.firestore.FieldValue.increment(1) });
    res.status(201).json({ id: ref.id, ...comment, createdAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addReply = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Reply cannot be empty' });

    const articleRef = db.collection('articles').doc(req.params.id);
    const articleSnap = await articleRef.get();
    if (!articleSnap.exists) return res.status(404).json({ message: 'Article not found' });

    const parentRef = articleRef.collection('comments').doc(req.params.commentId);
    const parentSnap = await parentRef.get();
    if (!parentSnap.exists) return res.status(404).json({ message: 'Parent comment not found' });
    if (parentSnap.data().parentId) return res.status(400).json({ message: 'Cannot reply to a reply' });

    const reply = {
      content: content.trim().slice(0, 500),
      authorId: req.uid,
      username: req.userDoc?.username || 'Anonymous',
      avatar: req.userDoc?.avatar || '',
      parentId: req.params.commentId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await articleRef.collection('comments').add(reply);
    res.status(201).json({ id: ref.id, ...reply, createdAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteComment = async (req, res) => {
  try {
    const commentRef = db.collection('articles').doc(req.params.id)
      .collection('comments').doc(req.params.commentId);
    const snap = await commentRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'Comment not found' });
    if (snap.data().authorId !== req.uid)
      return res.status(403).json({ message: 'Not authorized' });

    const batch = db.batch();
    batch.delete(commentRef);
    if (!snap.data().parentId) {
      const replies = await db.collection('articles').doc(req.params.id)
        .collection('comments').where('parentId', '==', req.params.commentId).get();
      replies.docs.forEach(r => batch.delete(r.ref));
      batch.update(db.collection('articles').doc(req.params.id), {
        commentCount: admin.firestore.FieldValue.increment(-1),
      });
    }
    await batch.commit();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getArticles, getTags, getArticle,
  createArticle, updateArticle, deleteArticle,
  toggleLike, toggleBookmark,
  addComment, addReply, deleteComment,
};
