//region Imports
const gulp = require('gulp')
const $ = require('gulp-load-plugins')()
const eslint = $.eslint
const babel = $.babel
//endregion

gulp.task('lint', function() {
  return gulp.src(['src/**/*.js']).pipe(eslint()).pipe(eslint.format()).pipe(eslint.failOnError())
})

gulp.task('compile', function() {
  return gulp.src('src/**/*.js')
    .pipe(babel())
    .pipe(gulp.dest('dist'))
})
