import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HowToSection from './HowToSection';

describe('HowToSection', () => {
  it('renders the tool instructions as an ordered list', () => {
    render(<HowToSection steps={['Choose a file.', 'Download the result.']} />);

    expect(screen.getByRole('heading', { name: 'How to use this tool' })).toBeTruthy();
    expect(screen.getByRole('list').children).toHaveLength(2);
  });

  it('does not render empty instructions', () => {
    const { container } = render(<HowToSection steps={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
