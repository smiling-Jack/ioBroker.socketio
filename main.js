/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var socketio = require('socket.io');
var fs =       require('fs');
var request =  require('request');
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

var webServer =  null;
var subscribes = {};
var infoTimeout = null;

var adapter = utils.adapter({
    name: 'socketio',
    install: function (callback) {
        if (typeof callback === 'function') callback();
    },
    objectChange: function (id, obj) {
        if (webServer) {
            publishAll('objectChange', id, obj);
            //webServer.io.sockets.emit('objectChange', id, obj);
        }
    },
    stateChange: function (id, state) {
        if (webServer) {
            publishAll('stateChange', id, state);
            //webServer.io.sockets.emit('stateChange', id, state);
        }
    },
    unload: function (callback) {
        try {
            adapter.log.info("terminating http" + (webServer.settings.secure ? "s" : "") + " server on port " + webServer.settings.port);
            webServer.io.close();

            callback();
        } catch (e) {
            callback();
        }
    },
    ready: function () {
        main();
    }
});

function main() {
    webServer = initWebServer(adapter.config);
}

function _initWebServer(settings, server) {

    if (settings.secure) {
        if (!settings.certificates) return;
        server.server = require('https').createServer(settings.certificates, function (req, res) {
            res.writeHead(501);
            res.end('Not Implemented');
        }).listen(settings.port, (settings.bind && settings.bind != "0.0.0.0") ? settings.bind : undefined);
    } else {
        server.server = require('http').createServer(function (req, res) {
            res.writeHead(501);
            res.end('Not Implemented');
        }).listen(settings.port, (settings.bind && settings.bind != "0.0.0.0") ? settings.bind : undefined);
    }

    server.io = socketio.listen(server.server);

//    server.io = socketio.listen(settings.port, (settings.bind && settings.bind != "0.0.0.0") ? settings.bind : undefined);

    if (settings.auth) {

        server.io.use(function (socket, next) {
            if (!socket.request._query.user || !socket.request._query.pass) {
                console.log("No password or username!");
                next(new Error('Authentication error'));
            } else {
                adapter.checkPassword(socket.request._query.user, socket.request._query.pass, function (res) {
                    if (res) {
                        console.log("Logged in: " + socket.request._query.user + ', ' + socket.request._query.pass);
                        return next();
                    } else {
                        console.log("Invalid password or user name: " + socket.request._query.user + ', ' + socket.request._query.pass);
                        next(new Error('Invalid password or user name'));
                    }
                });
            }
        });
    }
    server.io.set('origins', '*:*');
    server.io.on('connection', initSocket);

    adapter.log.info((settings.secure ? 'Secure ' : '') + 'socket.io server listening on port ' + settings.port);
}

//settings: {
//    "port":   8080,
//    "auth":   false,
//    "secure": false,
//    "bind":   "0.0.0.0", // "::"
//    "cache":  false
//}
function initWebServer(settings) {

    var server = {
        app:       null,
        server:    null,
        io:        null,
        settings:  settings
    };

    if (settings.port) {
        var taskCnt = 0;

        if (settings.secure) {

            // Load certificates
            taskCnt++;
            adapter.getForeignObject('system.certificates', function (err, obj) {
                if (err || !obj ||
                    !obj.native.certificates ||
                    !adapter.config.certPublic ||
                    !adapter.config.certPrivate ||
                    !obj.native.certificates[adapter.config.certPublic] ||
                    !obj.native.certificates[adapter.config.certPrivate]
                    ) {
                    adapter.log.error('Cannot enable secure Legacy web server, because no certificates found: ' + adapter.config.certPublic + ', ' + adapter.config.certPrivate);
                } else {
                    server.certificates = {
                        key:  obj.native.certificates[adapter.config.certPrivate],
                        cert: obj.native.certificates[adapter.config.certPublic]
                    };

                }
                taskCnt--;
                if (!taskCnt) _initWebServer(settings, server);
            });
        }
        taskCnt++;

        adapter.getPort(settings.port, function (port) {
            if (port != settings.port && !adapter.config.findNextPort) {
                adapter.log.error('port ' + settings.port + ' already in use');
                process.exit(1);
            }
            settings.port = port;
            //server.server.listen(port);
            taskCnt--;
            if (!taskCnt) _initWebServer(settings, server);
        });
    } else {
        adapter.log.error('port missing');
        process.exit(1);
    }

    if (!infoTimeout) infoTimeout = setTimeout(updateConnectedInfo, 1000);

    return server;
}

function initSocket(socket) {
    if (adapter.config.auth) {
        var user = null;
        socketEvents(socket, user);
    } else {
        socketEvents(socket);
    }
}

function pattern2RegEx(pattern) {
    if (pattern != '*') {
        if (pattern[0] == '*' && pattern[pattern.length - 1] != '*') pattern += '$';
        if (pattern[0] != '*' && pattern[pattern.length - 1] == '*') pattern = '^' + pattern;
    }
    pattern = pattern.replace(/\./g, '\\.');
    pattern = pattern.replace(/\*/g, '.*');
    return pattern;
}

function subscribe(socket, type, pattern) {
    console.log(socket.id + ' subscribe ' + pattern);
    socket._subscribe = socket._subscribe || {};
    if (!subscribes[type]) subscribes[type] = {};

    var s = socket._subscribe[type] = socket._subscribe[type] || [];
    for (var i = 0; i < s.length; i++) {
        if (s[i].pattern == pattern) {
            console.log(socket.id + ' subscribe ' + pattern + ' found');
            return;
        }
    }

    s.push({pattern: pattern, regex: new RegExp(pattern2RegEx(pattern))});

    if (subscribes[type][pattern] === undefined){
        subscribes[type][pattern] = 1;
        if (type == 'stateChange') {
            console.log(socket.id + ' subscribeForeignStates ' + pattern);
            adapter.subscribeForeignStates(pattern);
        }
    } else {
        subscribes[type][pattern]++;
        console.log(socket.id + ' subscribeForeignStates ' + pattern + ' ' + subscribes[type][pattern]);
    }
}

function unsubscribe(socket, type, pattern) {
    console.log(socket.id + ' unsubscribe ' + pattern);
    if (!subscribes[type]) subscribes[type] = {};

    if (!socket._subscribe || !socket._subscribe[type]) return;
    for (var i = 0; i < socket._subscribe[type].length; i++) {
        if (socket._subscribe[type][i].pattern == pattern) {

            // Remove pattern from global list
            if (subscribes[type][pattern] !== undefined){
                subscribes[type][pattern]--;
                if (!subscribes[type][pattern]) {
                    if (type == 'stateChange') {
                        console.log(socket.id + ' unsubscribeForeignStates ' + pattern);
                        adapter.unsubscribeForeignStates(pattern);
                    }
                    delete subscribes[type][pattern];
                } else {
                    console.log(socket.id + ' unsubscribeForeignStates ' + pattern + ' ' + subscribes[type][pattern]);
                }
            }

            delete socket._subscribe[type][i];
            return;
        }
    }
}

function unsubscribeSocket(socket, type) {
    console.log(socket.id + ' unsubscribeSocket');
    if (!socket._subscribe || !socket._subscribe[type]) return;

    for (var i = 0; i < socket._subscribe[type].length; i++) {
        var pattern = socket._subscribe[type][i].pattern;
        if (subscribes[type][pattern] !== undefined){
            subscribes[type][pattern]--;
            if (!subscribes[type][pattern]) {
                if (type == 'stateChange') {
                    console.log(socket.id + ' unsubscribeForeignStates ' + pattern);
                    adapter.unsubscribeForeignStates(pattern);
                }
                delete subscribes[type][pattern];
            } else {
                console.log(socket.id + ' unsubscribeForeignStates ' + pattern + subscribes[type][pattern]);
            }
        }
    }
}

function subscribeSocket(socket, type) {
    console.log(socket.id + ' subscribeSocket');
    if (!socket._subscribe || !socket._subscribe[type]) return;

    for (var i = 0; i < socket._subscribe[type].length; i++) {
        var pattern = socket._subscribe[type][i].pattern;
        if (subscribes[type][pattern] === undefined){
            subscribes[type][pattern] = 1;
            if (type == 'stateChange') {
                console.log(socket.id + ' subscribeForeignStates' + pattern);
                adapter.subscribeForeignStates(pattern);
            }
        } else {
            subscribes[type][pattern]++;
        }
    }
}

function publish(socket, type, id, obj) {
    if (!socket._subscribe || !socket._subscribe[type]) return;
    var s = socket._subscribe[type];
    for (var i = 0; i < s.length; i++) {
        if (s[i].regex.test(id)) {
            socket.emit(type, id, obj);
            return;
        }
    }
}

function publishAll(type, id, obj) {
    if (id === undefined) {
        console.log('Problem');
    }

    var clients = webServer.io.sockets.connected;

    for (var i in clients) {
        publish(clients[i], type, id, obj);
    }
}
function updateConnectedInfo() {
    if (infoTimeout) {
        clearTimeout(infoTimeout);
        infoTimeout = null;
    }
    var text = '';
    var cnt = 0;
    if (webServer && webServer.io && webServer.io.sockets) {
        var clients = webServer.io.sockets.connected;

        for (var i in clients) {
            text += (text ? ', ' : '') + (clients[i]._name || 'noname');
            cnt++;
        }
    }
    text = '[' + cnt + ']' + text;
    adapter.setState('connected', text, true);
}

function socketEvents(socket, user) {

    // TODO Check if user may create and delete objects and so on
    subscribeSocket(socket, 'stateChange');

    if (!infoTimeout) infoTimeout = setTimeout(updateConnectedInfo, 1000);


    socket.on('name', function (name) {
        if (this._name === undefined) {
            this._name = name;
            if (!infoTimeout) infoTimeout = setTimeout(updateConnectedInfo, 1000);
        } else if (this._name != name) {
            adapter.log.warn('socket ' + this.id + ' changed socket name from ' + this._name + ' to ' + name);
            this._name = name;
        }
    });

    /*
     *      objects
     */
    socket.on('getObject', function (id, callback) {
        adapter.getForeignObject(id, callback);
    });

    socket.on('getObjects', function (callback) {
        adapter.getForeignObjects('*', callback);
    });

    socket.on('subscribe', function (pattern) {
        subscribe(this, 'stateChange', pattern)
    });

    socket.on('unsubscribe', function (pattern) {
        unsubscribe(this, 'stateChange', pattern)
    });

    socket.on('getObjectView', function (design, search, params, callback) {
        adapter.objects.getObjectView(design, search, params, callback);
    });
    // TODO check user name
    socket.on('setObject', function (id, obj, callback) {
        adapter.setForeignObject(id, obj, callback);
    });
    /*
    socket.on('extendObject', function (id, obj, callback) {
        adapter.extendForeignObject(id, obj, callback);
    });

    socket.on('getHostByIp', function (ip, callback) {
        adapter.objects.getObjectView('system', 'host', {}, function (err, data) {
            if (data.rows.length) {
                for (var i = 0; i < data.rows.length; i++) {
                    if (data.rows[i].value.native.hardware && data.rows[i].value.native.hardware.networkInterfaces) {
                        var net = data.rows[i].value.native.hardware.networkInterfaces;
                        for (var eth in net) {
                            for (var j = 0; j < net[eth].length; j++) {
                                if (net[eth][j].address == ip) {
                                    if (callback) callback(ip, data.rows[i].value);
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            if (callback) callback(ip, null);
        });
    });*/

    /*
     *      states
     */
    socket.on('getStates', function (callback) {
        adapter.getForeignStates('*', callback);
    });

    socket.on('getState', function (id, callback) {
        adapter.getForeignState(id, callback);
    });
    // Todo check user name
    socket.on('setState', function (id, state, callback) {
        if (typeof state !== 'object') state = {val: state};
        adapter.setForeignState(id, state, function (err, res) {
            if (typeof callback === 'function') callback(err, res);
        });
    });

    socket.on('getVersion', function (callback) {
        if (typeof callback === 'function') callback(adapter.version);
    });

    /*
     *      History
     */
    socket.on('getStateHistory', function (id, start, end, callback) {
        adapter.getForeignStateHistory(id, start, end, callback);
    });

    // HTTP
    socket.on('httpGet', function (url, callback) {
        request(url, callback);
    });

    // iobroker commands
    // Todo check user name
    socket.on('sendTo', function (adapterInstance, command, message, callback) {
        adapter.sendTo(adapterInstance, command, message, callback);
    });

    socket.on('authEnabled', function (callback) {
        callback(adapter.config.auth);
    });

    socket.on('readFile', function (_adapter, fileName, callback) {
        adapter.readFile(_adapter, fileName, callback);
    });

    socket.on('readFile64', function (_adapter, fileName, callback) {
        adapter.readFile(_adapter, fileName, function (err, buffer) {
            var data64;
            if (buffer) {
                data64 = buffer.toString('base64');
            }
            //Convert buffer to base 64
            if (callback) {
                callback(err, data64);
            }
        });
    });

    socket.on('writeFile64', function (_adapter, fileName, data64, callback) {
        //Convert base 64 to buffer
        var buffer = new Buffer(data64, 'base64');
        adapter.writeFile(_adapter, fileName, buffer, function (err) {
            if (callback) {
                callback(err);
            }
        });
    });

    socket.on('readDir', function (_adapter, dirName, callback) {
        adapter.readDir(_adapter, dirName, callback);
    });

    socket.on('disconnect', function () {
        console.log('disonnect');
        unsubscribeSocket(this, 'stateChange');
        if (!infoTimeout) infoTimeout = setTimeout(updateConnectedInfo, 1000);
    });

    socket.on('reconnect', function () {
        console.log('reconnect');
        subscribeSocket(this, 'stateChange');
    });

    // TODO Check authorisation
    socket.on('writeFile', function (_adapter, fileName, data, callback) {
        adapter.writeFile(_adapter, fileName, data, callback);
    });
    socket.on('unlink', function (_adapter, name, callback) {
        adapter.unlink(_adapter, name, callback);
    });
    socket.on('rename', function (_adapter, oldName, newName, callback) {
        adapter.rename(_adapter, oldName, newName, callback);
    });
    socket.on('mkdir', function (_adapter, dirname, callback) {
        adapter.mkdir(_adapter, dirname, callback);
    });
}