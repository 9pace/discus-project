/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	STORAGE_COUNTSTABLE_ARN
	STORAGE_COUNTSTABLE_NAME
	STORAGE_COUNTSTABLE_STREAMARN
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoDB = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.STORAGE_COUNTSTABLE_NAME;

exports.handler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  
  const fieldName = event.info?.fieldName || (event.arguments.activityType ? 'logActivity' : 'getUserActivity');
  
  if (fieldName === 'logActivity') {
    const { userId, activityType, metadata } = event.arguments;
    const timestamp = new Date().toISOString();
    
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        postId: `user-${userId}`,
        metricType: `${activityType}#${timestamp}`,
        updatedAt: timestamp,
        metadata: metadata || ''
      }
    }));
    
    return {
      userId,
      timestamp,
      activityType,
      metadata: metadata || ''
    };
  }
  
  if (fieldName === 'getUserActivity') {
    const { userId } = event.arguments;
    
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'postId = :userId',
      ExpressionAttributeValues: { ':userId': `user-${userId}` },
      ScanIndexForward: false,
      Limit: 50
    }));
    
    return (result.Items || []).map(item => ({
      userId,
      timestamp: item.updatedAt,
      activityType: item.metricType.split('#')[0],
      metadata: item.metadata || ''
    }));
  }
};
