import chai = require('chai');
import main = require('../lib/main');

import {expectTranslate} from './test_support';

describe('main transpiler functionality', () => {
  describe(
      'comments', () => {
        it('keeps leading comments',
           () => {
             expectTranslate(`/* A */ var a;
/* B */ var b;`).to.equal(`/// A
@JS()
external get a;
@JS()
external set a(v);

/// B
@JS()
external get b;
@JS()
external set b(v);`);
             expectTranslate(`// A
var a;
/// B
var b;`).to.equal(`/// A
@JS()
external get a;
@JS()
external set a(v);

/// B
@JS()
external get b;
@JS()
external set b(v);`);
           });
        it('keeps ctor comments', () => {
          expectTranslate('/** A */ class A {\n /** ctor */ constructor() {}}').to.equal(`/// A
@JS()
class A {
  // @Ignore
  A.fakeConstructor$();

  /// ctor
  external factory A();
}`);
        });
        it('translates links to dart doc format', () => {
          expectTranslate('/** {@link this/place} */ var a').to.equal(`/// [this/place]
@JS()
external get a;
@JS()
external set a(v);`);
          expectTranslate('/* {@link 1} {@link 2} */ var a').to.equal(`/// [1] [2]
@JS()
external get a;
@JS()
external set a(v);`);
        });
        it('removes @module doc tags', () => {
          expectTranslate(`/** @module
 * This is a module for doing X.
 */`).to.equal(`/// This is a module for doing X.`);
        });
        it('removes @description doc tags', () => {
          expectTranslate(`/** @description
 * This is a module for doing X.
 */`).to.equal(`/// This is a module for doing X.`);
        });
        it('removes @depracted doc tags', () => {
          expectTranslate(`/**
 * Use SomethingElse instead.
 * @deprecated
 */`).to.equal(`/// Use SomethingElse instead.`);
        });
        it('removes @param doc tags', () => {
          expectTranslate(`/**
 * Method to do blah.
 * @param doc Document.
 */`).to.equal(`/// Method to do blah.`);
        });
        it('removes @return doc tags', () => {
          expectTranslate(`/**
 * Method to do blah.
 * @return {String}
 */`).to.equal(`/// Method to do blah.`);
        });
        it('removes @throws doc tags', () => {
          expectTranslate(`/**
 * Method to do blah.
 * @throws ArgumentException If arguments are wrong
 */`).to.equal(`/// Method to do blah.`);
        });
        it('multiple line comment', () => {
          expectTranslate(`/**
 * Method to do blah.
 * Bla bla bla.
 * Foo bar.
 */`).to.equal(`/// Method to do blah.
/// Bla bla bla.
/// Foo bar.`);
        });
        it('multiple line comment', () => {
          expectTranslate(`class Foo {
/**
* Method to do blah.
* Bla bla bla.
* Foo bar.
*/
  bar();
}`).to.equal(`@JS()
class Foo {
  // @Ignore
  Foo.fakeConstructor$();

  /// Method to do blah.
  /// Bla bla bla.
  /// Foo bar.
  external bar();
}`);

          expectTranslate(`class Foo {
// Baz.
// Bla bla bla.
// Foo bar.

// Bla.
bar();
}`).to.equal(`@JS()
class Foo {
  // @Ignore
  Foo.fakeConstructor$();

  /// Baz.
  /// Bla bla bla.
  /// Foo bar.

  /// Bla.
  external bar();
}`);
        });
      });

  describe('output paths', () => {
    it('writes within the path', () => {
      let transpiler = new main.Transpiler({basePath: '/a'});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '/x')).to.equal('/x/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', 'x')).to.equal('x/b/c.dart');
      chai.expect(() => transpiler.getOutputPath('/outside/b/c.js', '/x'))
          .to.throw(/must be located under base/);
    });
    it('defaults to writing to the same location', () => {
      let transpiler = new main.Transpiler({basePath: undefined});
      chai.expect(transpiler.getOutputPath('/a/b/c.js', '/e')).to.equal('/a/b/c.dart');
      chai.expect(transpiler.getOutputPath('b/c.js', '')).to.equal('b/c.dart');
    });
    it('translates .es6, .ts, and .js', () => {
      let transpiler = new main.Transpiler({basePath: undefined});
      ['a.js', 'a.ts', 'a.es6'].forEach((n) => {
        chai.expect(transpiler.getOutputPath(n, '')).to.equal('a.dart');
      });
    });
  });
});
