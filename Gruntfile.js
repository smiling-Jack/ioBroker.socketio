// To use this file in WebStorm, right click on the file name in the Project Panel (normally left) and select "Open Grunt Console"

/** @namespace __dirname */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

module.exports = function (grunt) {

    var srcDir    = __dirname + '/';
    var dstDir    = srcDir + '.build/';
    var pkg       = grunt.file.readJSON('package.json');
    var iopackage = grunt.file.readJSON('io-package.json');
    var version   = (pkg && pkg.version) ? pkg.version : iopackage.common.version;

    // Project configuration.
    grunt.initConfig({
        jsdoc : {
            dist : {
                src: ['lib/iobrokersocket.js'],
                options: {
                    destination: 'doc',
                    template : "node_modules/grunt-jsdoc/node_modules/ink-docstrap/template",
                    configure : "node_modules/grunt-jsdoc/node_modules/ink-docstrap/template/jsdoc.conf.json"
                }
            }
        }

    });

    grunt.loadNpmTasks('grunt-jsdoc');

    //grunt.registerTask('updateReadme', function () {
    //    var readme = grunt.file.read('README.md');
    //    var pos = readme.indexOf('## Changelog\r\n');
    //    if (pos != -1) {
    //        var readmeStart = readme.substring(0, pos + '## Changelog\r\n'.length);
    //        var readmeEnd   = readme.substring(pos + '## Changelog\r\n'.length);
    //
    //        if (iopackage.common && readme.indexOf(iopackage.common.version) == -1) {
    //            var timestamp = new Date();
    //            var date = timestamp.getFullYear() + '-' +
    //                ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
    //                ("0" + (timestamp.getDate()).toString(10)).slice(-2);
    //
    //            var news = "";
    //            if (iopackage.common.whatsNew) {
    //                for (var i = 0; i < iopackage.common.whatsNew.length; i++) {
    //                    if (typeof iopackage.common.whatsNew[i] == 'string') {
    //                        news += '* ' + iopackage.common.whatsNew[i] + '\r\n';
    //                    } else {
    //                        news += '* ' + iopackage.common.whatsNew[i].en + '\r\n';
    //                    }
    //                }
    //            }
    //
    //            grunt.file.write('README.md', readmeStart + '### ' + iopackage.common.version + ' (' + date + ')\r\n' + (news ? news + '\r\n\r\n' : '\r\n') + readmeEnd);
    //        }
    //    }
    //});

    //grunt.loadNpmTasks('grunt-replace');
    //grunt.loadNpmTasks('grunt-contrib-jshint');
    //grunt.loadNpmTasks('grunt-jscs');
    //grunt.loadNpmTasks('grunt-http');
    //grunt.loadNpmTasks('grunt-contrib-clean');
    //grunt.loadNpmTasks('grunt-contrib-compress');
    //grunt.loadNpmTasks('grunt-exec');
    //grunt.loadNpmTasks('grunt-contrib-copy');
    //
    //grunt.registerTask('default', [
    //    'exec',
    //    'http',
    //    'clean',
    //    'replace',
    //    'updateReadme',
    //    'compress',
    //    'copy',
    //    'jshint',
    //    'jscs'
    //]);
};