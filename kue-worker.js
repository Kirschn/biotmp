var mysql = require('mysql');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
sqlConnection.connect();
var kue = require('kue'),
    queue = kue.createQueue({
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    });
queue.on( 'error', function( err ) {
    console.log( 'Oops... ', err );
});
queue.process('msg_process', function (job, done) {
   console.log(job.data);
   done();
});