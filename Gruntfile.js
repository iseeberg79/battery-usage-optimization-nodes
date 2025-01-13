module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			src: ['nodes/*.js'],
			options: {
				esversion: 6,
				curly: true,
				undef: true,
				unused: true,
				globals: {
					module: true,
					msg: true,
					require: true,
					async: true,
					await: true,
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