import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import StoryItemEditor from './StoryItemEditor'

vi.mock('../api', () => ({
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  generateItemImage: vi.fn(),
  uploadItemImage: vi.fn(),
  editItemImage: vi.fn(),
}))

// Stub Draggable so we can render without a DragDropContext.
vi.mock('@hello-pangea/dnd', () => ({
  Draggable: ({ children }) =>
    children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}))

import * as api from '../api'

const baseItem = {
  id: 'item-1',
  type: 'image_scene',
  order_index: 0,
  description: 'A sunny meadow',
  caption: '',
  image_path: null,
  voice: null,
  adjusted_text: '',
}

// Wrapper keeps item state so onUpdate re-renders StoryItemEditor with new props.
function Wrapper({ initial = baseItem }) {
  const [item, setItem] = useState(initial)
  return (
    <StoryItemEditor
      item={item}
      index={0}
      storyVoice="john"
      onUpdate={(updated) => setItem(updated)}
      onDelete={() => {}}
    />
  )
}

function renderEditor(initial = baseItem) {
  render(<Wrapper initial={initial} />)
}

describe('StoryItemEditor — image_scene prompt modal', () => {
  beforeEach(() => {
    api.generateItemImage.mockReset()
    api.updateItem.mockResolvedValue(baseItem)
  })

  it('shows generate image button when item has no image', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: /generate image/i })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('opens prompt modal after generating an image with a returned prompt', async () => {
    api.generateItemImage.mockResolvedValue({
      image_path: '/static/images/test.png',
      prompt: 'Draw scene: A sunny meadow',
    })

    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('img'))
    expect(screen.getByText('Image Prompt')).toBeInTheDocument()
    expect(screen.getByText(/Draw scene: A sunny meadow/)).toBeInTheDocument()
  })

  it('closes the prompt modal when × is clicked', async () => {
    api.generateItemImage.mockResolvedValue({
      image_path: '/static/images/test.png',
      prompt: 'Draw scene: A sunny meadow',
    })

    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('img'))
    expect(screen.getByText('Image Prompt')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /×/ }))
    expect(screen.queryByText('Image Prompt')).not.toBeInTheDocument()
  })

  it('image is not clickable when no prompt was returned', async () => {
    api.generateItemImage.mockResolvedValue({
      image_path: '/static/images/test.png',
    })

    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    expect(screen.getByRole('img').className).not.toMatch(/cursor-pointer/)
  })

  it('caption field appears before the generate image button', () => {
    renderEditor()
    const caption = screen.getByPlaceholderText(/caption/i)
    const generateBtn = screen.getByRole('button', { name: /generate image/i })
    expect(caption.compareDocumentPosition(generateBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
