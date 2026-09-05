import { gradeValuesMatch } from './market-grade';

describe('gradeValuesMatch', () => {
  it('treats equivalent numeric grade formatting as the same grade', () => {
    expect(gradeValuesMatch('10.00', '10')).toBe(true);
    expect(gradeValuesMatch('9.50', '9.5')).toBe(true);
  });

  it('does not collapse different grades', () => {
    expect(gradeValuesMatch('10', '9.5')).toBe(false);
  });
});
