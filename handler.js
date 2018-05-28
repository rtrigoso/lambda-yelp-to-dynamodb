'use strict';

const AWS = require('aws-sdk'); 
const yelp = require('yelp-fusion');

const yClient = yelp.client(process.env.YELP_API_KEY);
var dynamodb = new AWS.DynamoDB();

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
    let business = pizzaBusinesses[i];
    let business_closed = business.is_closed ? '1' : '0';
    let business_address = `${business.location.address1} ${business.location.address2}`;
    let business_lon = `${business.coordinates.longitude}`;
    let business_lat = `${business.coordinates.latitude}`;
    let business_zip = `${business.location.zip_code}`;

    await dynamodb.updateItem({
      ExpressionAttributeNames: {
        '#A': 'Alias',
        '#AD': 'Address1', 
        '#CI': 'City', 
        '#C': 'Closed', 
        '#CO': 'Country', 
        '#IM': 'ImageURL',
        '#LON': 'Longitude',
        '#LAT': 'Latitude',
        '#N': 'Name',
        '#P': 'Phone',
        '#S': 'State',
        '#Z': 'ZipCode'
      }, 
      ExpressionAttributeValues: {
        ':a': {S: business.alias}, 
        ':ad': {S: business_address},
        ':ci': {S: business.location.city},
        ':co': {S: business.location.country},
        ':c': {N: business_closed},
        ':im': {S: business.image_url},
        ':lon': {N: business_lon},
        ':lat': {N: business_lat},
        ':n': {S: business.name},
        ':p': {S: business.phone},
        ':s': {S: business.location.state},
        ':z': {N: business_zip}
      }, 
      Key: {'Id': {S: business.id }}, 
      ReturnValues: 'UPDATED_NEW', 
      TableName: process.env.DYNAMODB_TABLE, 
      UpdateExpression: 'SET #A = :a, #AD = :ad, #CI = :ci, #C = :c, #CO = :co, #IM = :im, #LON = :lon, #LAT = :lat, #N = :n, #P = :p, #S = :s, #Z = :z'
    }).promise().catch(err => {
      failed(err);
      return false;
    });
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
