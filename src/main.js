import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/api';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import awsconfig from './aws-exports';
import * as mutations from './graphql/mutations';
import * as queries from './graphql/queries';

Amplify.configure(awsconfig);
const client = generateClient();

const DYNAMODB_TABLE = awsconfig.aws_dynamodb_table_schemas[0].tableName;

let currentDiscussionId = null;
let currentDiscussionName = null;
let currentTopicId = null;
let currentTopicName = null;
let currentPostId = null;
let currentUserPhone = null;

const DISCUSSIONS = [
  { id: 'tech', name: 'Technology', icon: '💻', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'science', name: 'Science', icon: '🔬', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'arts', name: 'Arts & Culture', icon: '🎨', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 'food', name: 'Food & Cooking', icon: '🍳', color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 'travel', name: 'Travel', icon: '✈️', color: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' }
];

async function getDynamoDBClient() {
  try {
    const session = await fetchAuthSession({ forceRefresh: true });
    if (!session.credentials) throw new Error('No credentials');
    const dynamoClient = new DynamoDBClient({
      region: awsconfig.aws_project_region,
      credentials: session.credentials
    });
    return DynamoDBDocumentClient.from(dynamoClient);
  } catch (error) {
    console.error('Error getting DynamoDB client:', error);
    throw error;
  }
}

function showPage(pageId) {
  ['signinPage', 'signupPage', 'confirmPage', 'mainApp'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(pageId).classList.remove('hidden');
  
  if (pageId === 'mainApp') {
    ['discussionsPage', 'topicsPage', 'postsPage', 'postDetailPage'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
  }
}

function showDiscussions() {
  document.getElementById('discussionsPage').classList.remove('hidden');
  loadDiscussions();
}

function showTopics(discussionId, discussionName) {
  currentDiscussionId = discussionId;
  currentDiscussionName = discussionName;
  document.getElementById('topicsPage').classList.remove('hidden');
  document.getElementById('discussionTitle').textContent = discussionName;
  loadTopics(discussionId);
}

function showPosts(topicId, topicName) {
  currentTopicId = topicId;
  currentTopicName = topicName;
  document.getElementById('postsPage').classList.remove('hidden');
  document.getElementById('topicTitle').textContent = topicName;
  loadPosts(topicId);
}

async function showPostDetail(postId) {
  currentPostId = postId;
  // Increment views
  const views = await incrementPostViews(postId);
  console.log('Post views:', views);
  document.getElementById('postDetailPage').classList.remove('hidden');
  loadPostDetail(postId);
  loadComments(postId);
}

checkAuthState();

async function checkAuthState() {
  try {
    const user = await getCurrentUser();
    currentUserPhone = user.signInDetails.loginId;
    showMainApp();
  } catch {
    showPage('signinPage');
  }
}

function showMainApp() {
  showPage('mainApp');
  const initials = currentUserPhone ? currentUserPhone.substring(1, 3).toUpperCase() : 'U';
  document.querySelectorAll('.avatar').forEach(el => el.textContent = initials);
  showDiscussions();
}

// Auth
document.getElementById('goToSignup').addEventListener('click', () => showPage('signupPage'));
document.getElementById('goToSignin').addEventListener('click', () => showPage('signinPage'));
document.getElementById('backToSignin').addEventListener('click', () => showPage('signinPage'));

document.getElementById('signupBtn').addEventListener('click', async () => {
  const phone = document.getElementById('signupPhone').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  
  try {
    await signUp({ username: phone, password, options: { userAttributes: { email } } });
    document.getElementById('confirmPhone').value = phone;
    showPage('confirmPage');
    alert('Sign up successful! Check your phone for confirmation code.');
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

document.getElementById('confirmBtn').addEventListener('click', async () => {
  const phone = document.getElementById('confirmPhone').value;
  const code = document.getElementById('confirmCode').value;
  
  try {
    await confirmSignUp({ username: phone, confirmationCode: code });
    alert('Confirmation successful! You can now sign in.');
    showPage('signinPage');
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

document.getElementById('signinBtn').addEventListener('click', async () => {
  const phone = document.getElementById('signinPhone').value;
  const password = document.getElementById('signinPassword').value;
  
  try {
    await signIn({ username: phone, password });
    await new Promise(resolve => setTimeout(resolve, 500));
    currentUserPhone = phone;
    showMainApp();
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

document.getElementById('signoutBtn').addEventListener('click', async () => {
  await signOut();
  showPage('signinPage');
});

// Navigation
document.getElementById('backToDiscussions').addEventListener('click', () => {
  document.getElementById('topicsPage').classList.add('hidden');
  showDiscussions();
});

document.getElementById('backToTopics').addEventListener('click', () => {
  document.getElementById('postsPage').classList.add('hidden');
  document.getElementById('topicsPage').classList.remove('hidden');
});

document.getElementById('backToPosts').addEventListener('click', () => {
  document.getElementById('postDetailPage').classList.add('hidden');
  document.getElementById('postsPage').classList.remove('hidden');
  loadPosts(currentTopicId);
});

// Discussions
function loadDiscussions() {
  const list = document.getElementById('discussionsList');
  list.innerHTML = '';
  
  DISCUSSIONS.forEach(disc => {
    const card = document.createElement('div');
    card.className = 'discussion-card';
    card.style.background = disc.color;
    card.innerHTML = `
      <div class="discussion-icon">${disc.icon}</div>
      <div class="discussion-name">${disc.name}</div>
      <div class="discussion-stats">Click to explore topics</div>
    `;
    card.onclick = () => {
      document.getElementById('discussionsPage').classList.add('hidden');
      showTopics(disc.id, disc.name);
    };
    list.appendChild(card);
  });
}

// Topics
async function loadTopics(discussionId) {
  try {
    const result = await client.graphql({ query: queries.listBlogs });
    const list = document.getElementById('topicsList');
    list.innerHTML = '';
    
    const topics = result.data.listBlogs.items.filter(b => b.name.startsWith(discussionId + ':'));
    
    if (topics.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📝</div>
          <div class="empty-text">No topics yet in ${currentDiscussionName}</div>
        </div>
      `;
      return;
    }
    
    for (const topic of topics) {
      const topicName = topic.name.split(':')[1] || topic.name;
      
      // Get posts count for this topic
      const postsResult = await client.graphql({
        query: queries.listPosts,
        variables: { filter: { blogPostsId: { eq: topic.id } } }
      });
      const postsCount = postsResult.data.listPosts.items.length;
      
      const item = document.createElement('div');
      item.className = 'topic-item';
      item.innerHTML = `
        <div class="topic-header">
          <div class="topic-title">${topicName}</div>
          <div class="topic-meta">${postsCount} posts</div>
        </div>
      `;
      item.onclick = () => {
        document.getElementById('topicsPage').classList.add('hidden');
        showPosts(topic.id, topicName);
      };
      list.appendChild(item);
    }
  } catch (error) {
    console.error('Error loading topics:', error);
  }
}

document.getElementById('createTopicBtn').addEventListener('click', async () => {
  const topicName = document.getElementById('topicNameInput').value.trim();
  if (!topicName) return;
  
  try {
    await client.graphql({
      query: mutations.createBlog,
      variables: { input: { name: `${currentDiscussionId}:${topicName}` } }
    });
    document.getElementById('topicNameInput').value = '';
    loadTopics(currentDiscussionId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
});


// Posts
const postTextarea = document.getElementById('postTextarea');
const postCharCount = document.getElementById('postCharCount');

postTextarea.addEventListener('input', () => {
  const length = postTextarea.value.length;
  postCharCount.textContent = `${length} / 500`;
});

document.getElementById('createPostBtn').addEventListener('click', async () => {
  const content = postTextarea.value.trim();
  if (!content) return;
  
  try {
    const title = content.substring(0, 60) + (content.length > 60 ? '...' : '');
    const postResult = await client.graphql({
      query: mutations.createPost,
      variables: { input: { title, blogPostsId: currentTopicId } }
    });
    
    const postId = postResult.data.createPost.id;
    const dynamoDB = await getDynamoDBClient();
    const timestamp = new Date().toISOString();
    
    await dynamoDB.send(new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        id: `post-${postId}`,
        col1: postId,
        col2: `${timestamp}|${content}|0|0`
      }
    }));
    
    postTextarea.value = '';
    postCharCount.textContent = '0 / 500';
    loadPosts(currentTopicId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

async function loadPosts(topicId) {
  try {
    const result = await client.graphql({
      query: queries.listPosts,
      variables: { filter: { blogPostsId: { eq: topicId } } }
    });
    
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '';
    
    if (result.data.listPosts.items.length === 0) {
      feed.innerHTML = `
        <div class="empty">
          <div class="empty-icon">💭</div>
          <div class="empty-text">No posts yet. Start the conversation!</div>
        </div>
      `;
      return;
    }
    
    for (const post of result.data.listPosts.items) {
      const dynamoDB = await getDynamoDBClient();
      let content = '';
      let likes = 0;
      let views = 0;
      
      try {
        const contentResult = await dynamoDB.send(new QueryCommand({
          TableName: DYNAMODB_TABLE,
          IndexName: 'col1index',
          KeyConditionExpression: 'col1 = :postId',
          ExpressionAttributeValues: { ':postId': post.id },
          ScanIndexForward: true
        }));
        
        if (contentResult.Items && contentResult.Items.length > 0) {
          const parts = contentResult.Items[0].col2.split('|');
          content = parts[1] || '';
          likes = parseInt(parts[2]) || 0;
          views = parseInt(parts[3]) || 0;
        }
      } catch (e) {
        console.error('Error loading content:', e);
      }
      
      // Get comments count
      const commentsResult = await client.graphql({
        query: queries.listComments,
        variables: { filter: { postCommentsId: { eq: post.id } } }
      });
      const commentsCount = commentsResult.data.listComments.items.length;
      
      const card = document.createElement('div');
      card.className = 'post-card';
      card.style.cursor = 'pointer';
      card.onclick = () => viewPost(post.id);
      card.innerHTML = `
        <div class="post-header">
          <div class="avatar">U</div>
          <div class="post-content-area">
            <div class="post-author">
              <span class="username">User</span>
              <span class="timestamp">• just now</span>
            </div>
            <div class="post-text">${content}</div>
            <div class="post-actions">
              <button class="action-btn" onclick="likePost('${post.id}', event)">
                ❤️ <span id="likes-${post.id}">${likes}</span>
              </button>
              <span class="action-btn">💬 ${commentsCount}</span>
              <span class="action-btn">👁️ ${views}</span>
              <button class="delete-btn" onclick="event.stopPropagation(); deletePost('${post.id}')">Delete</button>
            </div>
          </div>
        </div>
      `;
      feed.appendChild(card);

    }
  } catch (error) {
    console.error('Error loading posts:', error);
  }
}


window.likePost = async function(postId, event) {
  event.stopPropagation();
  try {
    const dynamoDB = await getDynamoDBClient();
    const result = await dynamoDB.send(new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id: `post-${postId}`, col1: postId }
    }));
    
    if (result.Item) {
      const parts = result.Item.col2.split('|');
      const timestamp = parts[0];
      const content = parts[1];
      const currentLikes = parseInt(parts[2]) || 0;
      const views = parseInt(parts[3]) || 0;
      const newLikes = currentLikes + 1;
      
      await dynamoDB.send(new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          id: `post-${postId}`,
          col1: postId,
          col2: `${timestamp}|${content}|${newLikes}|${views}`
        }
      }));
      
      document.getElementById(`likes-${postId}`).textContent = newLikes;
    }
  } catch (error) {
    console.error('Error liking post:', error);
  }
};


window.viewPost = function(postId) {
  document.getElementById('postsPage').classList.add('hidden');
  showPostDetail(postId);
};

window.deletePost = async function(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await client.graphql({
      query: mutations.deletePost,
      variables: { input: { id: postId } }
    });
    loadPosts(currentTopicId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
};

// Fix 1: Update loadPostDetail to fetch fresh comment count
async function loadPostDetail(postId) {
  try {
    const result = await client.graphql({
      query: queries.getPost,
      variables: { id: postId }
    });
    
    const post = result.data.getPost;
    const dynamoDB = await getDynamoDBClient();
    let content = '';
    let likes = 0;
    let views = 0;
    
    try {
      const contentResult = await dynamoDB.send(new QueryCommand({
        TableName: DYNAMODB_TABLE,
        IndexName: 'col1index',
        KeyConditionExpression: 'col1 = :postId',
        ExpressionAttributeValues: { ':postId': postId },
        ScanIndexForward: true
      }));
      
      if (contentResult.Items && contentResult.Items.length > 0) {
        const parts = contentResult.Items[0].col2.split('|');
        content = parts[1] || '';
        likes = parseInt(parts[2]) || 0;
        views = parseInt(parts[3]) || 0;
      }
    } catch (e) {
      console.error('Error loading content:', e);
    }
    
    // Get fresh comments count
    const commentsResult = await client.graphql({
      query: queries.listComments,
      variables: { filter: { postCommentsId: { eq: postId } } }
    });
    const commentsCount = commentsResult.data.listComments.items.length;
    
    document.getElementById('postDetail').innerHTML = `
      <div class="post-card">
        <div class="post-header">
          <div class="avatar">U</div>
          <div class="post-content-area">
            <div class="post-author">
              <span class="username">User</span>
              <span class="timestamp">• just now</span>
            </div>
            <div class="post-text">${content}</div>
            <div class="post-actions">
              <button class="action-btn" onclick="likePostDetail('${postId}')">
                ❤️ <span id="detail-likes-${postId}">${likes}</span>
              </button>
              <span class="action-btn">💬 ${commentsCount}</span>
              <span class="action-btn">👁️ ${views}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading post detail:', error);
  }
}

window.likePostDetail = async function(postId) {
  try {
    const dynamoDB = await getDynamoDBClient();
    const result = await dynamoDB.send(new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: { id: `post-${postId}`, col1: postId }
    }));
    
    if (result.Item) {
      const parts = result.Item.col2.split('|');
      const timestamp = parts[0];
      const content = parts[1];
      const currentLikes = parseInt(parts[2]) || 0;
      const views = parseInt(parts[3]) || 0;
      const newLikes = currentLikes + 1;
      
      await dynamoDB.send(new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          id: `post-${postId}`,
          col1: postId,
          col2: `${timestamp}|${content}|${newLikes}|${views}`
        }
      }));
      
      document.getElementById(`detail-likes-${postId}`).textContent = newLikes;
    }
  } catch (error) {
    console.error('Error liking post:', error);
  }
};


// Comments
const commentTextarea = document.getElementById('commentTextarea');
const commentCharCount = document.getElementById('commentCharCount');

commentTextarea.addEventListener('input', () => {
  const length = commentTextarea.value.length;
  commentCharCount.textContent = `${length} / 300`;
});

document.getElementById('addCommentBtn').addEventListener('click', async () => {
  const content = commentTextarea.value.trim();
  if (!content) return;
  
  try {
    await client.graphql({
      query: mutations.createComment,
      variables: { input: { content, postCommentsId: currentPostId } }
    });
    commentTextarea.value = '';
    commentCharCount.textContent = '0 / 300';
    loadComments(currentPostId);
    loadPostDetail(currentPostId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

async function loadComments(postId) {
  try {
    const result = await client.graphql({
      query: queries.listComments,
      variables: { filter: { postCommentsId: { eq: postId } } }
    });
    
    const list = document.getElementById('commentsList');
    list.innerHTML = '';
    
    if (result.data.listComments.items.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">💬</div>
          <div class="empty-text">No comments yet. Be the first!</div>
        </div>
      `;
      return;
    }
    
    for (const comment of result.data.listComments.items) {
      const div = document.createElement('div');
      div.className = 'comment';
      div.innerHTML = `
        <div class="avatar">U</div>
        <div class="comment-content">
          <div class="post-author">
            <span class="username">User</span>
            <span class="timestamp">• just now</span>
          </div>
          <div class="comment-text">${comment.content}</div>
          <button class="delete-btn" onclick="deleteComment('${comment.id}')">Delete</button>
        </div>
      `;
      list.appendChild(div);
    }
  } catch (error) {
    console.error('Error loading comments:', error);
  }
}

// When viewing a post, call this
async function incrementPostViews(postId) {
  try {
    const result = await client.graphql({
      query: `
        mutation IncrementViews($postId: ID!) {
          incrementViews(postId: $postId) {
            views
          }
        }
      `,
      variables: { postId }
    });
    console.log('Increment result:', result);
    return result.data.incrementViews.views;
  } catch (error) {
    console.error('Error incrementing views:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return 0;
  }
}

window.deleteComment = async function(commentId) {
  if (!confirm('Delete this comment?')) return;
  try {
    await client.graphql({
      query: mutations.deleteComment,
      variables: { input: { id: commentId } }
    });
    loadComments(currentPostId);
    loadPostDetail(currentPostId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
};
