const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoDB = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableNameKey = Object.keys(process.env).find(key => key.startsWith('STORAGE_') && key.endsWith('_NAME'));
const TABLE_NAME = process.env[tableNameKey];

exports.handler = async (event) => {
  const postId = event.arguments?.postId;
  if (!postId) throw new Error('Post ID required');
  
  const result = await dynamoDB.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { id: `post-${postId}`, col1: postId }
  }));
  
  if (!result.Item) throw new Error('Post not found');
  
  const parts = result.Item.col2.split('|');
  const newViews = (parseInt(parts[3]) || 0) + 1;
  
  await dynamoDB.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      id: `post-${postId}`,
      col1: postId,
      col2: `${parts[0]}|${parts[1]}|${parts[2]}|${newViews}`
    }
  }));
  
  return { views: newViews };
};
