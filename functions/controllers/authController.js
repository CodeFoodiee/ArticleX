
const admin = require('firebase-admin');
const db    = admin.firestore();

const getMe = (req, res) => {
  res.json(req.userDoc);
};

const updateMe = async (req, res) => {
  const { username, bio, avatar } = req.body;

  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 30) {
      return res.status(400).json({ message: 'Username must be 2–30 characters' });
    }
    const taken = await db.collection('users')
      .where('username', '==', username.trim())
      .limit(1).get();
    if (!taken.empty && taken.docs[0].id !== req.uid) {
      return res.status(400).json({ message: 'Username already taken' });
    }
  }

  const update = {};
  if (username !== undefined) update.username = username.trim();
  if (bio       !== undefined) update.bio      = bio.slice(0, 200);
  if (avatar    !== undefined) update.avatar   = avatar;
  update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await db.collection('users').doc(req.uid).update(update);
  const snap = await db.collection('users').doc(req.uid).get();
  res.json({ id: snap.id, ...snap.data() });
};

const deleteMe = async (req, res) => {
  const articles = await db.collection('articles').where('authorId', '==', req.uid).get();
  const batch = db.batch();
  articles.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(db.collection('users').doc(req.uid));
  await batch.commit();

  await admin.auth().deleteUser(req.uid);

  res.json({ message: 'Account deleted' });
};

module.exports = { getMe, updateMe, deleteMe };
