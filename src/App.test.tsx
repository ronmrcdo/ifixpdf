import {render, screen} from '@testing-library/react';
import {App} from './App';

describe('App', () => {
  it('renders the app name', async () => {
    render(<App />);
    expect(screen.getByText('iFixPDF')).toBeInTheDocument();
    // Home's recents load is async; ending before it lands let its setState run after jsdom teardown under load.
    expect(await screen.findByRole('heading', {name: 'No recent PDFs yet'})).toBeInTheDocument();
  });
});
