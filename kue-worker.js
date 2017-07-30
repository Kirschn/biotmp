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
queue.process('cmd_process', function (job, done) {
   //process string
    var msg = JSON.parse(job.data["message-obj"]);
    var splittedContent = msg.message.split(" ");
    sqlConnection.query("SELECT id, triggerword, reply, picture FROM autoreply_commands WHERE triggerword = ?", splittedContent[1], function (err, results) {
       if (err) done(err);
       if (results.length === 0) {
           queue.create("message_send", {
               "title": "No such command REPLY",
               "channel_id": msg.channel.id,
               "message": "<@" + msg.author.id + "> No such command",
               "options": JSON.stringify({})
           }).save(done);
       } else {
           // parse reply
           // first parse inserts
           if (results[0]["reply"].indexOf("RNDLIST[") !== -1 && results[0]["reply"].indexOf("]RNDLIST") !== -1) {
               // ayy rndlist
               var itemList = results[0]["reply"].split("RNDLIST[")[1].split("]RNDLIST")[0].split(", ");
               var item = itemList[Math.floor((Math.random()*itemList.length))];
               results[0]["reply"] = results[0]["reply"].replace("RNDLIST[" + itemList.join(", ") + "]RNDLIST", item);
           }
           queue.create("message_send", {
               "title": "No such command REPLY",
               "channel_id": msg.channel.id,
               "message": results[0]["reply"],
               "options": JSON.stringify({})
           }).save(done);
       }

    });

});