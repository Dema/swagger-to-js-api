var gulp = require('gulp');
var rename = require('gulp-rename');
var babel = require('gulp-babel');
var del = require('del');

gulp.task('clean', function() {
  return del([ 'dist' ]);
});

gulp.task('babel', function() {
  return gulp
    .src('src/**/*.js')
    .pipe(
      babel({
        presets: [ 'flow', 'es2015', 'stage-0' ],
        ignore: [ '*test.js', 'test/*.js' ],
      }),
    )
    .pipe(gulp.dest('dist'));
});

gulp.task('flow', function() {
  return gulp
    .src('src/helpers/*.js')
    .pipe(rename({ extname: '.js.flow' }))
    .pipe(gulp.dest('dist/helpers'));
});
gulp.task('default', gulp.series('clean', gulp.parallel('babel', 'flow')));
