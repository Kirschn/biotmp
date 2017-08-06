var mysql = require('mysql');
var fs = require("fs");
const path = require('path');
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
var url = require('url');
sqlConnection.connect();
var request= require("request");
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
function download(uri, filename, cb) {
    var protocol = url.parse(uri).protocol.slice(0, -1);

    var onError = function (e) {
        fs.unlink(filename);
        cb(e);
    }
    require(protocol).get(uri, function(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
            var fileStream = fs.createWriteStream(filename);
            fileStream.on('error', onError);
            fileStream.on('close', function() {
                cb (filename)
            });
            response.pipe(fileStream);
        } else if (response.headers.location) {
            filename = randomString(16) + path.extname(response.headers.location);
            download(response.headers.location, filename, cb);
        } else {
            cb(new Error(response.statusCode + ' ' + response.statusMessage));
        }
    }).on('error', onError);

}

function randomString(length)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < length; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

queue.process('cmd_process', function (job, done) {
   //process string
    var msg = JSON.parse(job.data["message-obj"]);
    console.log(msg);
    var splittedContent = msg.message.split(" ");
    if (splittedContent[1] === "cmd") {
        // Systemcommand Mode
        if (splittedContent[2] === "command") {
            if (splittedContent[3] === "add") {
                if (splittedContent[4] !== undefined) {
                    job.log("Adding Command...");
                    var sql = "INSERT INTO autoreply_commands (triggerword, reply) VALUES ?, ?";
                    var reply = "";
                    if (splittedContent[5] !== undefined) {
                        // ayy starttest
                        reply = msg.message.replace(splittedContent[0] + " cmd command add " + splittedContent[4] + " ", "");
                        job.log("Command has startparameter");
                    }
                    sqlConnection.query(sql, [splittedContent[4], reply], function (err) {
                        if (err) throw err;
                        queue.create("message_send", {
                            "title": "Command Add Confirmation",
                            "channel_id": msg.channel.id,
                            "message": "<@" + msg.author.id + "> Command added",
                            "options": JSON.stringify({})
                        }).save(function () {
                            done();
                        });
                    });
                }
            } else if (splittedContent[6] !== undefined) {
                if (splittedContent[4] === "set") {
                    var sql = "UPDATE autoreply_commands SET ";
                    var insertValues = [];
                    switch (splittedContent[5]) {
                        case "reply":
                            sql += "reply";
                            insertValues.push(msg.message.replace(splittedContent[0] + " cmd command " + splittedContent[3] + " set reply ", ""));
                            break;
                        case "picture":
                            sql += "picture";
                            insertValues.push(splittedContent[6]);
                            break;
                        case "name":
                            sql += "triggerword";
                            insertValues.push(splittedContent[6]);
                            break;
                        default:
                            // Syntax Error
                            return false;
                    }
                    sql += " WHERE triggerword = ?";
                    insertValues.push(splittedContent[3]);
                    sqlConnection.query(sql, insertValues, function (err) {
                        if (!err) {
                            queue.create("message_send", {
                                "title": "Command Edit Confirmation",
                                "channel_id": msg.channel.id,
                                "message": "<@" + msg.author.id + "> " + splittedContent[3] + " edited",
                                "options": JSON.stringify({})
                            }).save(function () {
                                done();
                            });
                        } else {
                            done(err);
                        }
                    })
                }
            }
        } else if (splittedContent[2] === "trigger") {

        } else {
            // Syntax Error
        }

    } else if (splittedContent[1] === "gif") {
        request('https://api.tenor.com/v1/search?q=' + splittedContent[2] + '&key=LIVDSRZULELA', function (error, response, body) {
            if (error) {
                done(error);
                console.log(error);
            }
            var API_RES = JSON.parse(body);
            var index = Math.floor(Math.random() * API_RES.results.length);
            var imgURL = API_RES.results[index]["media"][0]["gif"]["url"];
            var filename = randomString(16) + path.extname(imgURL);

            job.log("Downloading Image...");
            job.log("Download Location: " + config.tmp_file_storage);
            download(imgURL,
                config.tmp_file_storage + "/" + filename
                , function (fname) {
                    job.log("Download Complete: " + fname);
                    job.log("Queueing Image Message");
                    queue.create("message_image_send", {
                        "title": "Triggercommand Image Reply",
                        "channel_id": msg.channel.id,
                        "message": "",
                        "image": fname,
                        "options": JSON.stringify({})
                    }).save(function () {
                        done();
                    });
            })
        });
    } else {
        sqlConnection.query("SELECT id, triggerword, reply, picture FROM autoreply_commands WHERE triggerword = ?", splittedContent[1], function (err, results) {
            if (err) done(err);
            if (results.length === 0) {
                queue.create("message_send", {
                    "title": "No such command REPLY",
                    "channel_id": msg.channel.id,
                    "message": "<@" + msg.author.id + "> No such command",
                    "options": JSON.stringify({})
                }).save(function () {
                    done();
                });
            } else {
                // parse reply
                // first parse inserts
                if (results[0]["reply"].indexOf("RNDLIST[") !== -1 && results[0]["reply"].indexOf("]RNDLIST") !== -1) {
                    // ayy rndlist
                    var itemList = results[0]["reply"].split("RNDLIST[")[1].split("]RNDLIST")[0].split(", ");
                    var item = itemList[Math.floor((Math.random() * itemList.length))];
                    results[0]["reply"] = results[0]["reply"].replace("RNDLIST[" + itemList.join(", ") + "]RNDLIST", item);
                }
                if (results[0]["picture"] === null) {
                    queue.create("message_send", {
                        "title": "Triggercommand Reply",
                        "channel_id": msg.channel.id,
                        "message": results[0]["reply"],
                        "options": JSON.stringify({})
                    }).save(function () {
                        done();
                    });
                } else {
                    // First fetch the Image to the download location
                    var filename = randomString(16) + path.extname(results[0]["picture"]);
                    job.log("Downloading Image...");
                    job.log("Download Location: " + config.tmp_file_storage);
                    download(results[0]["picture"],
                        config.tmp_file_storage + "/" + filename
                        , function (fname) {
                            job.log("Download Complete: " + fname);
                            job.log("Queueing Image Message");
                            queue.create("message_image_send", {
                                "title": "Triggercommand Image Reply",
                                "channel_id": msg.channel.id,
                                "message": results[0]["reply"],
                                "image": fname,
                                "options": JSON.stringify({})
                            }).save(function () {
                                done();
                            });
                        });


                }
            }

        });
    }

});