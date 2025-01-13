module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			src: ['nodes/*.js'],
			options: {
				esversion: 8,
				curly: true,
				eqeqeq: true,
				undef: true,
				unused: true,
				globals: {
					jQuery: true,
					module: true,
					msg: true,
					RED: true
				}
			}
		},
		jsdoc: {
			dist: {
				src: ['nodes/*.js'],
				options: {
					destination: 'build/docs'
				}
			}
		},
		shell: {
			npm_pack: {
				command: 'npm pack --pack-destination ./build'
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-jsdoc');
	grunt.loadNpmTasks('grunt-shell');

	// Default task(s).
	grunt.registerTask('default', ['jshint', 'jsdoc', 'shell:npm_pack']);
};