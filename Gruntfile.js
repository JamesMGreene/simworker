/*global module:false*/
module.exports = function(grunt) {

  var localPort = 11138;  // WEB

  // Project configuration.
  grunt.initConfig({
    // Metadata.
    pkg: grunt.file.readJSON('package.json'),
    banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
      '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
      ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n',
    // Task configuration.
    jshint: {
      options: {
        jshintrc: ".jshintrc"
      },
      gruntfile: ['Gruntfile.js'],
      src: ['worker.js'],
      test: ['test/**/*.js']
    },
    connect: {
      server: {
        options: {
          port: localPort
        }
      }
    },
    qunit: {
      file: ['test/index.html'],
      http: {
        options: {
          urls: ['http://localhost:' + localPort + '/test/index.html']
        }
      }
    },
    uglify: {
      options: {
        banner: '<%= banner %>'
      },
      dist: {
        src: ['worker.js'],
        dest: 'dist/worker.min.js'
      }
    },
    watch: {
      gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
      },
      src: {
        files: '<%= jshint.src.src %>',
        tasks: ['jshint:src', 'test']
      },
      test: {
        files: '<%= jshint.test.src %>',
        tasks: ['jshint:test', 'test']
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Shortcut task for unit testing.
  grunt.registerTask('test',  ['connect', 'qunit']);

  // Task for Travis CI.
  grunt.registerTask('travis',  ['jshint', 'test']);

  // Default task.
  grunt.registerTask('default', ['jshint', 'test', 'uglify']);

};
