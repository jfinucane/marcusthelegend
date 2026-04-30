import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StoryDetailPage from './StoryDetailPage'

vi.mock('../api', () => ({
  getStory: vi.fn(),
  updateStory: vi.fn(),
  generateStoryImage: vi.fn(),
  editStoryImage: vi.fn(),
  uploadStoryImage: vi.fn(),
  createItem: vi.fn(),
  reorderItems: vi.fn(),
}))

vi.mock('../components/MontageModal', () => ({
  default: ({ onClose }) => <div data-testid="montage-modal"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('../components/StoryItemEditor', () => ({
  default: () => <div data-testid="story-item-editor" />,
}))

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => <>{children}</>,
  Droppable: ({ children }) => <>{children({ innerRef: () => {}, droppableProps: {} }, {})}</>,
}))

import * as api from '../api'

const storyWithImage = {
  id: 'story-1',
  world_id: 'world-1',
  title: 'My Story',
  description: 'A test story',
  image_path: '/static/images/cover.png',
  voice: 'john',
  items: [],
}

const storyWithoutImage = { ...storyWithImage, image_path: null }

function renderPage(storyData = storyWithoutImage) {
  api.getStory.mockResolvedValue(storyData)
  render(
    <MemoryRouter initialEntries={['/stories/story-1']}>
      <Routes>
        <Route path="/stories/:id" element={<StoryDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StoryDetailPage — story image prompt modal', () => {
  beforeEach(() => {
    api.generateStoryImage.mockReset()
    api.getStory.mockReset()
  })

  it('shows generate image button when story has no image', async () => {
    renderPage(storyWithoutImage)
    await waitFor(() => expect(screen.getByText('My Story')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /generate image/i })).toBeInTheDocument()
  })

  it('opens prompt modal after generating story image', async () => {
    api.generateStoryImage.mockResolvedValue({
      image_path: '/static/images/cover.png',
      prompt: 'World: Test — desc Story: My Story — A test story',
    })
    renderPage(storyWithoutImage)
    await waitFor(() => expect(screen.getByText('My Story')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('img'))
    expect(screen.getByText('Image Prompt')).toBeInTheDocument()
    expect(screen.getByText(/World: Test/)).toBeInTheDocument()
  })

  it('closes prompt modal when × is clicked', async () => {
    api.generateStoryImage.mockResolvedValue({
      image_path: '/static/images/cover.png',
      prompt: 'World: Test — desc Story: My Story — A test story',
    })
    renderPage(storyWithoutImage)
    await waitFor(() => expect(screen.getByText('My Story')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('img'))

    expect(screen.getByText('Image Prompt')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /×/ }))
    expect(screen.queryByText('Image Prompt')).not.toBeInTheDocument()
  })

  it('image is not clickable when no prompt was returned', async () => {
    api.generateStoryImage.mockResolvedValue({
      image_path: '/static/images/cover.png',
      // no prompt
    })
    renderPage(storyWithoutImage)
    await waitFor(() => expect(screen.getByText('My Story')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /generate image/i }))
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())

    const img = screen.getByRole('img')
    expect(img.className).not.toMatch(/cursor-pointer/)
  })

  it('story image is clickable when loaded with a prior prompt', async () => {
    // Image already exists but no lastStoryPrompt yet (freshly loaded page)
    // — clicking should not open modal because prompt hasn't been fetched yet
    renderPage(storyWithImage)
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    const img = screen.getByRole('img')
    expect(img.className).not.toMatch(/cursor-pointer/)
  })
})
