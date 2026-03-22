
const admin = require('firebase-admin');
const db    = admin.firestore();

/**
 * protect — hard-require a valid token.
 */
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(header.split('Bearer ')[1]);
    req.uid = decoded.uid;

    const userRef = db.collection('users').doc(decoded.uid);
    const snap    = await userRef.get();

    if (!snap.exists) {
      const profile = {
        uid:       decoded.uid,
        email:     decoded.email      || '',
        username:  decoded.name       || decoded.email?.split('@')[0] || `user_${decoded.uid.slice(0, 6)}`,
        avatar:    decoded.picture    || '',
        bio:       '',
        bookmarks: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await userRef.set(profile);
      req.userDoc = { id: decoded.uid, ...profile };
    } else {
      req.userDoc = { id: snap.id, ...snap.data() };
    }

    next();
  } catch (err) {
    console.error('Auth error:', err.code || err.message);
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
};

/**
 * optionalAuth — attach user info if token is present, never block.
 */
const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const decoded = await admin.auth().verifyIdToken(header.split('Bearer ')[1]);
      req.uid = decoded.uid;
      const snap = await db.collection('users').doc(decoded.uid).get();
      if (snap.exists) req.userDoc = { id: snap.id, ...snap.data() };
    } catch (_) { /* ignore */ }
  }
  next();
};

module.exports = { protect, optionalAuth };
