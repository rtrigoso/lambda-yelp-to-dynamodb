'use strict';

const AWS = require('aws-sdk'); 
const yelp = require('yelp-fusion');

const yClient = yelp.client(process.env.YELP_API_KEY);
var dynamodb = new AWS.DynamoDB();

const config = [
  {
    key: 'name',
    subKey: false,
    attrNameKey: '#N',
    attrNameValue: 'Name',
    attrValueKey: ':n',
    type: 'S'
  },
  {
    key: 'alias',
    subKey: false,
    attrNameKey: '#A',
    attrNameValue: 'Alias',
    attrValueKey: ':a',
    type: 'S'
  },
  {
    key: 'phone',
    subKey: false,
    attrNameKey: '#P',
    attrNameValue: 'Phone',
    attrValueKey: ':p',
    type: 'S'
  },
  {
    key: 'image_url',
    subKey: false,
    attrNameKey: '#I',
    attrNameValue: 'Image',
    attrValueKey: ':i',
    type: 'S'
  },
  {
    key: 'location',
    subKey: 'address1',
    attrNameKey: '#AD1',
    attrNameValue: 'Address1',
    attrValueKey: ':ad1',
    type: 'S'
  },
  {
    key: 'location',
    subKey: 'address2',
    attrNameKey: '#AD2',
    attrNameValue: 'Address2',
    attrValueKey: ':ad2',
    type: 'S'
  },
  {
    key: 'location',
    subKey: 'city',
    attrNameKey: '#CI',
    attrNameValue: 'City',
    attrValueKey: ':ci',
    type: 'S'
  },
  {
    key: 'location',
    subKey: 'state',
    attrNameKey: '#S',
    attrNameValue: 'State',
    attrValueKey: ':s',
    type: 'S'
  },
  {
    key: 'location',
    subKey: 'zip_code',
    attrNameKey: '#Z',
    attrNameValue: 'Zip',
    attrValueKey: ':z',
    type: 'N'
  },
  {
    key: 'coordinates',
    subKey: 'longitude',
    attrNameKey: '#LON',
    attrNameValue: 'Longitude',
    attrValueKey: ':lon',
    type: 'N'
  },
  {
    key: 'coordinates',
    subKey: 'latitude',
    attrNameKey: '#LAT',
    attrNameValue: 'Latitude',
    attrValueKey: ':lat',
    type: 'N'
  },
];

const checkIfNotEmpty = s => {
  return (s !== null && s !== '');
};

const buildUpdateExpression = business => {
  let UpdateExpressionArray = [];
  let expAttName = {};
  let expAttVal = {};

  for (let i = 0; i < config.length; i++) 
  {
    const e = config[i];
    let dataValue = business[e.key];

    if(e.subKey !== false)
    {
      dataValue = business[e.key][e.subKey];
    }

    if(checkIfNotEmpty(dataValue))
    {
      let valKey = e.attrValueKey; 
      let nameKey = e.attrNameKey; 
      let nameVal = e.attrNameValue; 
      let valType = e.type; 

      expAttName[`${nameKey}`] = nameVal;      
      expAttVal[`${valKey}`] = {};
      expAttVal[`${valKey}`][valType] = `${dataValue}`;
      UpdateExpressionArray.push(`${nameKey} = ${valKey}`);
    } 
  }

  return {
    ExpressionAttributeNames: expAttName,
    ExpressionAttributeValues: expAttVal,
    Key: {'Id': {S: business.id }}, 
    ReturnValues: 'UPDATED_NEW', 
    TableName: process.env.DYNAMODB_TABLE,
    UpdateExpression: `SET ${UpdateExpressionArray.join(', ')}`
  };

};

module.exports.getPizzerias = async (event, context, callback) => {
  const failed = e => {
    const response = {
      statusCode: 400,
      body: JSON.stringify({
        message: `failed to save the pizzerias: ${e.message}`,
        input: event,
      }),
    };

    callback(null, response);
    return false;
  };

  let yResponse = await yClient.search({categories:'pizza', location: 'Raleigh, NC', radius: 40000, limit:50 }).catch(e => {
    failed(e);
    return false;
  });
  let pizzaBusinesses = yResponse.jsonBody.businesses;

  while (yResponse.jsonBody.businesses.length === 50) {
    yResponse = await yClient.search({categories:'pizza', location: 'Raleigh, NC', radius: 40000, limit:50, offset:pizzaBusinesses.length }).catch(e => {
      failed(e);
      return false;
    });
    pizzaBusinesses = pizzaBusinesses.concat(yResponse.jsonBody.businesses);
  }

  let pizzeriaTable = await dynamodb.describeTable({TableName: process.env.DYNAMODB_TABLE}).promise().catch(err => {
    failed(err);
    return false;
  });

  if(!pizzeriaTable) {
    pizzeriaTable = await dynamodb.createTable({ 
      AttributeDefinitions: [{AttributeName: 'Id', AttributeType: 'S' }],
      KeySchema: [{AttributeName: 'Id', KeyType: 'HASH'}], 
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5}, 
      TableName: process.env.DYNAMODB_TABLE
    }).promise().catch(err => {
      failed(err);
      return false;
    });
  }

  for(let i = 0; i < pizzaBusinesses.length; i++) {
    if(!pizzaBusinesses[i].is_closed )
    {
      let updateObj = buildUpdateExpression(pizzaBusinesses[i]);
      await dynamodb.updateItem(updateObj).promise().catch(err => {
        failed(err);
        return false;
      });
    }
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'finished',
      input: event,
    }),
  };

  callback(null, response);
};
