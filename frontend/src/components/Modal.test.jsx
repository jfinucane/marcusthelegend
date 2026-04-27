import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

describe('Modal', () => {
  it('renders title and children', () => {
    render(<Modal title="Test Title" onClose={() => {}}><p>body text</p></Modal>)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('calls onClose when × button is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="T" onClose={onClose}><span /></Modal>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
