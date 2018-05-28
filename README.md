# Save Businesses to DynamoDB with Lambda
Stores yelp businesses in a dynamodb private for private use

### before running:
- create a yelp api key 
- pass it through --yelp command on serverless deploy
- you can switch the name of the table on serverless.yml

### TODO:
1. Add configuration for cloudwatch scheduled event
2. Create small RDS table for queries or reconfigure the table to have a smarter sort key
3. Add point system to each business