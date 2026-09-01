import { PRESERVED_OWNER_DEMO } from './retire-synthetic-demo-data';

describe('synthetic demo retirement boundary', () => {
  it('pins the owner-created Pikachu that must survive fixture cleanup', () => {
    expect(PRESERVED_OWNER_DEMO).toEqual({
      submissionId: '07dbf13f-f712-4d4a-adcf-96c45c7e641b',
      assetId: '8403a76f-c92c-4206-a7e7-7546b2098919',
      certificationNumber: '107760843',
    });
  });
});
