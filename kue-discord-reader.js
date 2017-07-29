const Discord = require("discord.js");
var mysql = require('mysql');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
var discordClient = null;
sqlConnection.connect();

var kue = require('kue'),
    queue = kue.createQueue({
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    });
function resolveReferences(json) {
    if (typeof json === 'string')
        json = JSON.parse(json);

    var byid = {}, // all objects by id
        refs = []; // references to objects that could not be resolved
    json = (function recurse(obj, prop, parent) {
        if (typeof obj !== 'object' || !obj) // a primitive value
            return obj;
        if (Object.prototype.toString.call(obj) === '[object Array]') {
            for (var i = 0; i < obj.length; i++)
                // check also if the array element is not a primitive value
                if (typeof obj[i] !== 'object' || !obj[i]) // a primitive value
                    continue;
                else if ("$ref" in obj[i])
                    obj[i] = recurse(obj[i], i, obj);
                else
                    obj[i] = recurse(obj[i], prop, obj);
            return obj;
        }
        if ("$ref" in obj) { // a reference
            var ref = obj.$ref;
            if (ref in byid)
                return byid[ref];
            // else we have to make it lazy:
            refs.push([parent, prop, ref]);
            return;
        } else if ("$id" in obj) {
            var id = obj.$id;
            delete obj.$id;
            if ("$values" in obj) // an array
                obj = obj.$values.map(recurse);
            else // a plain object
                for (var prop in obj)
                    obj[prop] = recurse(obj[prop], prop, obj);
            byid[id] = obj;
        }
        return obj;
    })(json); // run it!

    for (var i = 0; i < refs.length; i++) { // resolve previously unknown references
        var ref = refs[i];
        ref[0][ref[1]] = byid[ref[2]];
        // Notice that this throws if you put in a reference at top-level
    }
    return json;
}

var triggerWords = {

};
var clientState = {
    "online": false,
    "loginName": null,
    "onlineSince": null
};
queue.on( 'error', function( err ) {
    console.log( 'Oops... ', err );
});
function biotmp(token) {
    function queueMSG(msg) {
        console.log(msg);
        var elMSGObj = {
            "message": msg.content,
            "channel": {
                "type": msg.channel.type,
                "id": msg.channel.id,
                "name": msg.channel.name
            },
            "server": {
                "id": msg.channel.guild.id,
                "name": msg.channel.guild.name
            },
            "author": msg.author,
            "tts": msg.tts,
            "system": msg.system,
            "nonce": msg.nonce,
            "mentions": {
                "everyone": msg.mentions.everyone,
                "users": JSON.stringify(msg.mentions.users),
                "roles": JSON.stringify(msg.mentions.roles)

            }
        };
        var job = queue.create('msg_process', {
            "title": "Discord Message Processing",
            "message-obj": JSON.stringify(resolveReferences(elMSGObj))

        }).priority("low").save( function(err){
            if( !err ) console.log( job.id );
        });
    }
    discordClient = new Discord.Client();
    discordClient.on('ready', function () {
        console.log("Logged in as " + discordClient.user.tag);
        console.log("https://discordapp.com/oauth2/authorize?client_id=" + config.clientID + "&scope=bot&permissions=0")
        clientState.online = true;
        clientState.loginName = discordClient.user.tag;
        clientState.online = Date.now();
    });

    discordClient.on('message', function (msg) {
        if (triggerWords[msg.channel.guild.id] === undefined && msg.content.indexOf("biotmp ") === 0) {
            // triggered - default
            // add triggerword to msg object for further processing
            console.log("Triggered");
            msg.triggerWord = "biotmp ";
            //and queue processing
            queueMSG(msg);
        } else if (triggerWords[msg.channel.guild.id] !== undefined) {
            if (msg.content.indexOf(triggerWords[msg.channel.guild.id] + " ") === 0) {
                // triggered - custom triggerword
                // add triggerword to msg object for further processing
                msg.triggerWord = triggerWords[msg.channel.guild.id] + " ";
                //and queue processing
                queueMSG(msg);

            }
        }

    });

    discordClient.login(token);
}
function updateTriggerWords() {
    sqlConnection.query("SELECT id, server_id, triggerword FROM triggerword", function (err, results) {
       if (err) throw err;
       triggerWords = {};
       results.forEach(function (currentEntry) {
           triggerWords[currentEntry.server_id] = currentEntry.triggerword;
       });
    });
}
setInterval(updateTriggerWords, 1000);
biotmp(config.token);