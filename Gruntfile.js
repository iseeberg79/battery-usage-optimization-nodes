module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		eslint: {
			target: ['nodes/*.js'] // Pfad zu den JavaScript-Dateien
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

	//grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-eslint');
	grunt.loadNpmTasks('grunt-jsdoc');
	grunt.loadNpmTasks('grunt-shell');

	// Default task(s).
	//grunt.registerTask('default', ['jshint', 'jsdoc', 'shell:npm_pack']);
	grunt.registerTask('default', ['eslint', 'jsdoc', 'shell:npm_pack']);
};
