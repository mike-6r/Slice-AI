import { BlockchainAnalysisAdapter, normalizeChain } from './blockchain-analysis.adapter';

const config = { blockchainAnalysisApiKey: 'ba_live_not_a_real_key', blockchainAnalysisApiBaseUrl: 'https://blockchainanalysis.io/api/v1', blockchainAnalysisRequestTimeoutMs: 1000 };
describe('BlockchainAnalysisAdapter', () => {
  it('sends documented Bearer-authenticated single-address KYT requests', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { riskLevel: 'LOW', sanctioned: false, flags: [] } }), { status: 200 }));
    const adapter = new BlockchainAnalysisAdapter(config, fetcher);
    await expect(adapter.screen({ address: '0xabc', chain: 'ethereum', currency: 'GBP' })).resolves.toMatchObject({ decision: 'ALLOW' });
    expect(fetcher).toHaveBeenCalledWith('https://blockchainanalysis.io/api/v1/kyt', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ba_live_not_a_real_key' }) }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ address: '0xabc', chain: 'ETH' });
  });
  it('serializes transaction-pair KYT and normalizes review/block conditions', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { riskLevel: 'MEDIUM', sanctioned: false, flags: ['MIXING'] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { riskLevel: 'LOW', sanctioned: true, flags: [] } }), { status: 200 }));
    const adapter = new BlockchainAnalysisAdapter(config, fetcher);
    await expect(adapter.screen({ from: '0xfrom', address: '0xto', chain: 'ETH', currency: 'GBP' })).resolves.toMatchObject({ decision: 'MANUAL_REVIEW' });
    await expect(adapter.screen({ address: '0xsanctioned', chain: 'BTC', currency: 'GBP' })).resolves.toMatchObject({ decision: 'BLOCK', reasonCode: 'KYT_SANCTIONS' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ from: '0xfrom', to: '0xto', chain: 'ETH' });
  });
  it('fails closed for missing credentials, unsupported chains, and provider errors', async () => {
    await expect(new BlockchainAnalysisAdapter({ ...config, blockchainAnalysisApiKey: undefined }, jest.fn()).screen({ address: '0xabc', chain: 'ETH', currency: 'GBP' })).rejects.toMatchObject({ response: { code: 'BLOCKCHAIN_ANALYSIS_CREDENTIALS_UNAVAILABLE' } });
    expect(() => normalizeChain('unknown-net')).toThrow('unsupported');
    await expect(new BlockchainAnalysisAdapter(config, jest.fn().mockResolvedValue(new Response('{}', { status: 429 }))).screen({ address: '0xabc', chain: 'ETH', currency: 'GBP' })).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
  });
});
