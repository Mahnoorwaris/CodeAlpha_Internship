const router = require('express').Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const Comment = require('../models/Comment');

const MAX_CONTENT_LENGTH = 500;
const AUTHOR_FIELDS = 'name username profilePicture';

function parseCommentId(raw) {
  return mongoose.isValidObjectId(raw) ? raw : null;
}

function publicComment(comment) {
  const a = comment.author;
  const author =
    a && typeof a === 'object' && a._id
      ? { id: a._id, name: a.name, username: a.username, profilePicture: a.profilePicture }
      : { id: a || null, name: null, username: null, profilePicture: '' };
  return {
    id: comment._id,
    post: comment.post,
    author,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

// PUT /api/comments/:id - edit own comment only (auth required)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parseCommentId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    if (String(comment.author) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this comment' });
    }

    const { content } = req.body || {};
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment content cannot be empty' });
    }
    if (text.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Comment content must be at most ${MAX_CONTENT_LENGTH} characters` });
    }

    comment.content = text;
    await comment.save();
    await comment.populate('author', AUTHOR_FIELDS);

    res.json({ success: true, message: 'Comment updated successfully', comment: publicComment(comment) });
  } catch (err) {
    console.error('[COMMENTS/update]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while updating comment' });
  }
});

// DELETE /api/comments/:id - delete own comment only (auth required)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseCommentId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    if (String(comment.author) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('[COMMENTS/delete]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while deleting comment' });
  }
});

module.exports = router;
