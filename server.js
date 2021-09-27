var express = require('express');
var app = express();
require('dotenv').config();
var s3BasicAuth = require('s3-basic-auth');

var protectedProxy = s3BasicAuth({
    key: process.env.AWS_ACCESS_KEY_ID,
    secret: process.env.AWS_SECRET_ACCESS_KEY,
    host: process.env.S3_BUCKET,
    region: process.env.AWS_REGION, // if not specified, defaults to us-east-1
    expires: 10, // seconds that the presigned URL is valid for
    credentials: process.env.PROXY_USER + ':' + process.env.PROXY_PASS, // username:password
    method: 'proxy' // 'proxy', 'redirect', 'presignedUrl' are valid options
})

app.use('/:path', protectedProxy); // Important: the `:path` param is expected by the middleware

app.listen(3000, function () {
    console.log('listening on port 3000');
});