import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeatureRequestPage from './FeatureRequestPage';
import { sendEmail } from '../api/email';

// Mock the sendEmail function
jest.mock('../api/email', () => ({
  sendEmail: jest.fn(),
}));

describe('FeatureRequestPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders the form correctly', () => {
    render(<FeatureRequestPage />);
    expect(screen.getByText('Submit an Idea')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe your feature idea in detail...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Request/i })).toBeInTheDocument();
  });

  it('shows error if required fields are empty', async () => {
    render(<FeatureRequestPage />);
    
    // Submit without filling anything
    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Please provide your email and describe your feature idea.')).toBeInTheDocument();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('submits successfully and shows success message', async () => {
    (sendEmail as jest.Mock).mockResolvedValueOnce({ success: true });
    
    render(<FeatureRequestPage />);
    
    // Fill the form
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Describe your feature idea in detail...'), { target: { value: 'My awesome idea' } });
    
    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    // Wait for success message
    expect(await screen.findByText(/Your feature request has been submitted successfully/i)).toBeInTheDocument();
    
    // Verify API call
    expect(sendEmail).toHaveBeenCalledWith({
      formType: 'feature_request',
      userEmail: 'test@example.com',
      subject: 'Feature Request from Test User',
      messageBody: 'My awesome idea',
      name: 'Test User',
    });
  });

  it('shows error message on api failure', async () => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    render(<FeatureRequestPage />);
    
    // Fill the form
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Describe your feature idea in detail...'), { target: { value: 'Another idea' } });
    
    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    // Wait for error message
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
