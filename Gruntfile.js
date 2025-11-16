module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		shell: {
			eslint: {
				command: 'npm run lint'
			},
			jsdoc: {
				command: 'npx jsdoc -c jsdoc.json'
			},
			npm_pack: {
				command: 'rm -rf ./build; mkdir -p ./build/ && npm pack --pack-destination ./build'
			}
		}
	});

	//grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-shell');

	// Default task(s).
	//grunt.registerTask('default', ['jshint', 'jsdoc', 'shell:npm_pack']);
	grunt.registerTask('default', ['shell:eslint', 'shell:jsdoc', 'shell:npm_pack']);
};
