require('source-map-support').install();

var clangFormat = require('clang-format');
var formatter = require('gulp-clang-format');
var gulp = require('gulp');
var gutil = require('gulp-util');
var merge = require('merge2');
var mocha = require('gulp-mocha');
var sourcemaps = require('gulp-sourcemaps');
var ts = require('gulp-typescript');
var typescript = require('typescript');
var tslint = require('gulp-tslint');

function checkFormat() {
  return gulp.src(['*.js', 'lib/**/*.ts', 'test/**/*.ts'])
      .pipe(formatter.checkFormat('file', clangFormat))
      .on('warning', onError);
}
exports['test.check-format'] = checkFormat;

function checkLint() {
  return gulp.src(['lib/**/*.ts', 'test/**/*.ts'])
      .pipe(tslint({formatter: 'verbose'}))
      .pipe(tslint.report())
      .on('warning', onError);
}
exports['test.check-lint'] = checkLint;

var hasError;
var failOnError = true;

var onError = function(err) {
  hasError = true;
  gutil.log(err.message);
  if (failOnError) {
    process.exit(1);
  }
};

var tsProject =
    ts.createProject('tsconfig.json', {noEmit: false, declaration: true, typescript: typescript});

gulp.task('compile', () => {
  hasError = false;
  var tsResult = gulp.src(['lib/**/*.ts', 'node_modules/typescript/lib/typescript.d.ts'])
                     .pipe(sourcemaps.init())
                     .pipe(tsProject())
                     .on('error', onError);
  return merge([
    tsResult.dts.pipe(gulp.dest('build/definitions')),
    // Write external sourcemap next to the js file
    tsResult.js.pipe(sourcemaps.write('.')).pipe(gulp.dest('build/lib')),
    tsResult.js.pipe(gulp.dest('build/lib')),
  ]);
});

gulp.task('test.compile', gulp.series('compile', function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp.src(['test/**/*.ts', 'node_modules/dart-style/dart-style.d.ts'], {base: '.'})
      .pipe(sourcemaps.init())
      .pipe(tsProject())
      .on('error', onError)
      .js.pipe(sourcemaps.write())
      .pipe(gulp.dest('build/'));  // '/test/' comes from base above.
}));

unitTests = gulp.series('test.compile', function(done) {
  if (hasError) {
    done();
    return;
  }
  return gulp.src('build/test/**/*.js').pipe(mocha({
    timeout: 4000,  // Needed by the type-based tests :-(
    fullTrace: true,
  }));
});
exports['test.unit'] = unitTests;

gulp.task('test', gulp.series(checkFormat, checkLint, unitTests));

gulp.task('watch', gulp.series(unitTests, function() {
  failOnError = false;
  // Avoid watching generated .d.ts in the build (aka output) directory.
  return gulp.watch(['lib/**/*.ts', 'test/**/*.ts'], {ignoreInitial: true}, ['test.unit']);
}));

gulp.task('default', gulp.series('compile'));