module.exports = function(grunt) {

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
//		jshint: {
//			src: ['nodes/*.js'],
//			options: { esversion: 6, curly: true, eqeqeq: true, undef: true, unused: true, globals: { jQuery: true } }
//		},
//		jsdoc: {
//			options: {
//				destination: 'build/docs'
//			},
//			dist: {
//				src: ['nodes/*.js']
//			}
//		},
		uglify: {
			options: {
				banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
			},
			build: {
				src: 'src/<%= pkg.name %>.js',
				dest: 'build/<%= pkg.name %>.min.js'
			}
		}
	});

//	grunt.loadNpmTasks('grunt-contrib-jshint');
//	grunt.loadNpmTasks('grunt-jsdoc');
	grunt.loadNpmTasks('grunt-contrib-uglify');

	// Default task(s).
	grunt.registerTask('default', ['uglify']);
	//grunt.registerTask('default', ['jshint', 'jsdoc', 'uglify']);

};
