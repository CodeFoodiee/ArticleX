const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getMe, updateMe, deleteMe } = require('../controllers/authController');

router.get('/',    protect, getMe);      // GET  /api/auth/me  (alias)
router.get('/me',  protect, getMe);
router.put('/me',  protect, updateMe);
router.delete('/me', protect, deleteMe);

module.exports = router;
