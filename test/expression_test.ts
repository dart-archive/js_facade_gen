import {expectTranslate} from './test_support';

function expectEmptyTranslates(cases: string[]) {
  for (const tsCode of cases) {
    expectTranslate(tsCode).to.equal('');
  }
}

// TODO(jacobr): we don't really need to be specifying separate code for the
// JS and Dart version for these tests as the code formatting is identical.
describe('ignore expressions', () => {
  it('math', () => {
    expectEmptyTranslates([
      '1 + 2',
      '1 - 2',
      '1 * 2',
      '1 / 2',
      '1 % 2',
      'x++',
      'x--',
      '++x',
      '--x',
      '-x',
    ]);
  });
  it('assigns', () => {
    expectEmptyTranslates([
      'x += 1',
      'x -= 1',
      'x *= 1',
      'x /= 1',
      'x %= 1',
      'x <<= 1',
      'x >>= 1',
      'x >>>= 1',
      'x &= 1',
      'x ^= 1',
      'x |= 1',
    ]);
  });
  it('compares', () => {
    expectEmptyTranslates([
      '1 == 2',
      '1 != 2',
      '1 > 2',
      '1 < 2',
      '1 >= 2',
      '1 <= 2',
    ]);
  });
  it('compares identity', () => {
    expectEmptyTranslates(['1 === 2', '1 !== 2']);
  });
  it('bit fiddles', () => {
    expectEmptyTranslates(
        ['x & 2', '1 & 2', '1 | 2', '1 ^ 2', '~1', '1 << 2', '1 >> 2', '0x1 & 0x2', '1 >>> 2']);
  });
  it('translates logic', () => {
    expectEmptyTranslates([
      '1 && 2',
      '1 || 2',
      '!1',
    ]);
  });
  it('translates ternary', () => {
    expectTranslate('var x = 1 ? 2 : 3').to.equal(`@JS()
external get x;
@JS()
external set x(v);`);
  });
  it('translates the comma operator', () => {
    expectTranslate('var x = [1, 2]').to.equal(`@JS()
external get x;
@JS()
external set x(v);`);
  });
  it('translates "in"', () => {
    expectTranslate('x in y').to.equal('');
  });
  it('translates "instanceof"', () => {
    expectTranslate('1 instanceof Foo').to.equal('');
  });
  it('translates "this"', () => {
    expectTranslate('this.x').to.equal('');
  });
  it('translates "delete"', () => {
    expectTranslate('delete x[y];').to.equal('');
  });
  it('translates "typeof"', () => {
    expectTranslate('typeof x;').to.equal('');
  });
  it('translates "void"', () => {
    expectTranslate('void x;').to.equal('');
  });
  it('translates parens', () => {
    expectTranslate('(1)').to.equal('');
  });

  it('translates property paths', () => {
    expectTranslate('foo.bar;').to.equal('');
    expectTranslate('foo[bar];').to.equal('');
  });
});
