const AWS = require('aws-sdk')

const polly = new AWS.Polly({
    signatureVersion: 'v4',
    region: 'us-east-1'
});

module.exports = { polly };