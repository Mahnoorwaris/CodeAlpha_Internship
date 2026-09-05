const router = require('express').Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const Post = require('../models/Post');
const Comment = require('../models/Comment');

const MAX_CONTENT_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 500;
const AUTHOR_FIELDS = 'name username profilePicture';

function publicPost(post) {
  const a = post.author;
  const author =
    a && typeof a === 'object' && a._id
      ? { id: a._id, name: a.name, username: a.username, profilePicture: a.profilePicture }
      : { id: a || null, name: null, username: null, profilePicture: '' };
  return {
    id: post._id,
    author,
    content: post.content,
    imageUrl: post.imageUrl,
    likesCount: post.likes.length,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function parsePostId(raw) {
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

// POST /api/posts - create post (auth required)
router.post('/', authenticate, async (req, res) => {
  try {
    const { content, imageUrl } = req.body || {};
    const text = typeof content === 'string' ? content.trim() : '';

    if (!text) {
      return res.status(400).json({ success: false, message: 'Post content is required and cannot be empty' });
    }
    if (text.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Post content must be at most ${MAX_CONTENT_LENGTH} characters` });
    }

    let image = '';
    if (imageUrl !== undefined && imageUrl !== null && String(imageUrl).trim() !== '') {
      image = String(imageUrl).trim();
      if (image.length > 500) {
        return res.status(400).json({ success: false, message: 'imageUrl must be at most 500 characters' });
      }
    }

    const post = await Post.create({ author: req.userId, content: text, imageUrl: image });
    await post.populate('author', AUTHOR_FIELDS);

    res.status(201).json({ success: true, message: 'Post created successfully', post: publicPost(post) });
  } catch (err) {
    console.error('[POSTS/create]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while creating post' });
  }
});

// GET /api/posts - feed (public), newest first, author info populated
router.get('/', async (req, res) => {
  try {
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100);

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', AUTHOR_FIELDS);

    res.json({ success: true, count: posts.length, posts: posts.map(publicPost) });
  } catch (err) {
    console.error('[POSTS/feed]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while loading feed' });
  }
});

// GET /api/posts/:id - single post (public)
router.get('/:id', async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id).populate('author', AUTHOR_FIELDS);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, post: publicPost(post) });
  } catch (err) {
    console.error('[POSTS/getById]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while loading post' });
  }
});

// PUT /api/posts/:id - update own post only
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (String(post.author) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this post' });
    }

    const { content, imageUrl } = req.body || {};
    const updates = {};

    if (content !== undefined) {
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        return res.status(400).json({ success: false, message: 'Post content cannot be empty' });
      }
      if (text.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({ success: false, message: `Post content must be at most ${MAX_CONTENT_LENGTH} characters` });
      }
      updates.content = text;
    }

    if (imageUrl !== undefined) {
      if (imageUrl === null || String(imageUrl).trim() === '') {
        updates.imageUrl = '';
      } else {
        const image = String(imageUrl).trim();
        if (image.length > 500) {
          return res.status(400).json({ success: false, message: 'imageUrl must be at most 500 characters' });
        }
        updates.imageUrl = image;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update - provide content and/or imageUrl' });
    }

    Object.assign(post, updates);
    await post.save();
    await post.populate('author', AUTHOR_FIELDS);

    res.json({ success: true, message: 'Post updated successfully', post: publicPost(post) });
  } catch (err) {
    console.error('[POSTS/update]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while updating post' });
  }
});

// DELETE /api/posts/:id - delete own post only
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (String(post.author) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    await post.deleteOne();
    await Comment.deleteMany({ post: post._id });

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    console.error('[POSTS/delete]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while deleting post' });
  }
});

// POST /api/posts/:id/like - like a post (auth required, no duplicates)
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.likes.some((u) => String(u) === String(req.userId))) {
      return res.status(409).json({ success: false, message: 'You have already liked this post' });
    }

    const updated = await Post.findByIdAndUpdate(
      id,
      { $addToSet: { likes: req.userId } },
      { new: true }
    );

    res.json({ success: true, message: 'Post liked successfully', likesCount: updated.likes.length });
  } catch (err) {
    console.error('[POSTS/like]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while liking post' });
  }
});

// DELETE /api/posts/:id/like - remove own like from a post (auth required)
router.delete('/:id/like', authenticate, async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (!post.likes.some((u) => String(u) === String(req.userId))) {
      return res.status(409).json({ success: false, message: 'You have not liked this post' });
    }

    const updated = await Post.findByIdAndUpdate(
      id,
      { $pull: { likes: req.userId } },
      { new: true }
    );

    res.json({ success: true, message: 'Post unliked successfully', likesCount: updated.likes.length });
  } catch (err) {
    console.error('[POSTS/unlike]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while unliking post' });
  }
});

// POST /api/posts/:id/comments - add comment to a post (auth required)
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const { content } = req.body || {};
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment content cannot be empty' });
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Comment content must be at most ${MAX_COMMENT_LENGTH} characters` });
    }

    let comment = await Comment.create({ post: post._id, author: req.userId, content: text });
    await comment.populate('author', AUTHOR_FIELDS);

    res.status(201).json({ success: true, message: 'Comment added successfully', comment: publicComment(comment) });
  } catch (err) {
    console.error('[POSTS/comment-create]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while adding comment' });
  }
});

// GET /api/posts/:id/comments - list comments for a post (public), newest first
router.get('/:id/comments', async (req, res) => {
  try {
    const id = parsePostId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comments = await Comment.find({ post: id })
      .sort({ createdAt: -1 })
      .populate('author', AUTHOR_FIELDS);

    res.json({ success: true, count: comments.length, comments: comments.map(publicComment) });
  } catch (err) {
    console.error('[POSTS/comments-list]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while loading comments' });
  }
});

module.exports = router;
