import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantChat from './AssistantChat';
import { chatAssistant } from '../../lib/ai';

vi.mock('../../lib/ai', () => ({
  chatAssistant: vi.fn(),
}));

describe('AssistantChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not ask visitors for an API key and displays the model answer', async () => {
    chatAssistant.mockResolvedValue({ text: 'Use the Audio Trimmer.', model: 'site-model' });
    render(<AssistantChat />);

    expect(screen.getByText(/No personal API key needed/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the assistant' }), {
      target: { value: 'How can I cut an audio file?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByText('Use the Audio Trimmer.')).toBeTruthy());
    expect(chatAssistant).toHaveBeenCalledWith([
      { role: 'user', content: 'How can I cut an audio file?' },
    ]);
  });

  it('shows a backend error instead of pretending the answer succeeded', async () => {
    chatAssistant.mockRejectedValue(new Error('No model is connected.'));
    render(<AssistantChat />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message the assistant' }), {
      target: { value: 'Hello assistant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect((await screen.findByRole('alert')).textContent).toContain('No model is connected.');
  });
});
