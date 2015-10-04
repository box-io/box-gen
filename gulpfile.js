//region Imports
const gulp = require('gulp')
const $ = require('gulp-load-plugins')()
const eslint = $.eslint
//endregion

gulp.task('lint', () => {
  return gulp.src(['src/**/*.js']).pipe(eslint()).pipe(eslint.format()).pipe(eslint.failOnError())
})
