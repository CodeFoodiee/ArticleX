const router = require('express').Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/articleController');

router.get('/tags',                    ctrl.getTags);
router.get('/',                        ctrl.getArticles);
router.get('/:id',                     ctrl.getArticle);

router.post('/',                       protect, ctrl.createArticle);
router.put('/:id',                     protect, ctrl.updateArticle);
router.delete('/:id',                  protect, ctrl.deleteArticle);
router.post('/:id/like',               protect, ctrl.toggleLike);
router.post('/:id/bookmark',           protect, ctrl.toggleBookmark);
router.post('/:id/comments',           protect, ctrl.addComment);
router.post('/:id/comments/:commentId/replies', protect, ctrl.addReply);
router.delete('/:id/comments/:commentId', protect, ctrl.deleteComment);

module.exports = router;
