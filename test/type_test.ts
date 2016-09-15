/// <reference path="../typings/mocha/mocha.d.ts"/>
import {expectTranslate} from './test_support';

describe('types', () => {
  it('supports qualified names', () => {
    expectTranslate('var x: foo.Bar;').to.equal(`@JS()
external foo.Bar get x;
@JS()
external set x(foo.Bar v);`);
  });
  it('comment type literals', () => {
    expectTranslate('var x: {x: string, y: number};').to.equal(`@JS()
external dynamic /*{x: string, y: number}*/ get x;
@JS()
external set x(dynamic /*{x: string, y: number}*/ v);`);
  });
  it('do not translates string index signatures to dartisms', () => {
    // We wish these could be just Map<String, dynamic> but sadly can't support
    // that yet.
    expectTranslate('var x: {[k: string]: any[]};').to.equal(`@JS()
external dynamic /*JSMap of <String,List<dynamic>>*/ get x;
@JS()
external set x(dynamic /*JSMap of <String,List<dynamic>>*/ v);`);
    expectTranslate('var x: {[k: number]: number};').to.equal(`@JS()
external dynamic /*JSMap of <num,num>*/ get x;
@JS()
external set x(dynamic /*JSMap of <num,num>*/ v);`);
  });
  it('drops type literals with index signatures and other properties', () => {
    expectTranslate('var x: {a: number, [k: string]: number};').to.equal(`@JS()
external dynamic /*{a: number, [k: string]: number}*/ get x;
@JS()
external set x(dynamic /*{a: number, [k: string]: number}*/ v);`);
  });
  it('does not mangle prototype names', () => {
    expectTranslate('import toString = require("./somewhere");')
        .to.equal('import "somewhere.dart" as toString;');
  });
  it('should support union types', () => {

    expectTranslate('function foo() : number | number[];').to.equal(`@JS()
external dynamic /*num|List<num>*/ foo();`);
    expectTranslate('var x: number|List<string>;').to.equal(`@JS()
external dynamic /*num|List<String>*/ get x;
@JS()
external set x(dynamic /*num|List<String>*/ v);`);
    expectTranslate('function x(): number|List<{[k: string]: any}> {};').to.equal(`@JS()
external dynamic /*num|List<JSMap of <String,dynamic>>*/ x();`);
  });
  it('should support array types', () => {
    expectTranslate('var x: string[] = [];').to.equal(`@JS()
external List<String> get x;
@JS()
external set x(List<String> v);`);
  });
  it('should support function types', () => {
    expectTranslate('var x: (a: string) => string;').to.equal(`import "package:func/func.dart";

@JS()
external Func1<String, String> get x;
@JS()
external set x(Func1<String, String> v);`);
  });
});

describe('type arguments', () => {
  it('should support declaration', () => {
    expectTranslate('class X<A, B> { a: A; }').to.equal(`@JS()
class X<A, B> {
  // @Ignore
  X.fakeConstructor$();
  external A get a;
  external set a(A v);
}`);
  });
  it('should support nested extends', () => {
    expectTranslate('class X<A extends B<C>> { }').to.equal(`@JS()
class X<A extends B<C>> {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should multiple extends', () => {
    expectTranslate('class X<A extends A1, B extends B1> { }').to.equal(`@JS()
class X<A extends A1, B extends B1> {
  // @Ignore
  X.fakeConstructor$();
}`);
  });
  it('should support use', () => {
    expectTranslate('class X extends Y<A, B> { }').to.equal(`@JS()
class X extends Y<A, B> {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
  });
  it('should remove single <void> generic argument', () => {
    expectTranslate('var x: X<number>;').to.equal(`@JS()
external X<num> get x;
@JS()
external set x(X<num> v);`);
    expectTranslate('class X extends Y<void> { }').to.equal(`@JS()
class X extends Y {
  // @Ignore
  X.fakeConstructor$() : super.fakeConstructor$();
}`);
  });
});
