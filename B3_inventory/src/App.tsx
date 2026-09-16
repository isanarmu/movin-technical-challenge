import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import inventory from './inventory.json'
import movinLogo from './assets/movin-logo.svg'
import './App.css'

type InventoryItem = {
  id: string
  label: string
  quantity: number
  volumeM3: number | null
  confidence: number | null
  movable: boolean
}

type Room = {
  roomId: string
  name: string
  photoCount: number
  items: InventoryItem[]
}

type Confirmation = {
  propertyId: string
  confirmedAt: string
  rooms: Room[]
  knownVolumeM3: number
  totalVolumeM3: number | null
  itemsWithoutVolume: number
}

const volumeFormat = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const REVIEW_THRESHOLD = 0.8

function AddItemForm({
  room,
  onAdd,
}: {
  room: Room
  onAdd: (item: InventoryItem) => void
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)

    const label = String(data.get('label') ?? '').trim()
    const quantity = Number(data.get('quantity'))
    const volumeText = String(data.get('volume') ?? '').trim()
    const volumeM3 = volumeText === '' ? null : Number(volumeText)

    if (
      !label ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999 ||
      (volumeM3 !== null &&
        (!Number.isFinite(volumeM3) ||
          volumeM3 <= 0 ||
          volumeM3 > 1000))
    ) {
      return
    }

    onAdd({
      id: crypto.randomUUID(),
      label,
      quantity,
      volumeM3,
      confidence: null,
      movable: true,
    })

    form.reset()

    if (detailsRef.current) {
      detailsRef.current.open = false
    }

    summaryRef.current?.focus()
  }

  return (
    <details className="add-item" ref={detailsRef}>
      <summary ref={summaryRef}>Add an item to {room.name}</summary>

      <form onSubmit={handleSubmit}>
        <label htmlFor={`name-${room.roomId}`}>Item name</label>

        <input
          id={`name-${room.roomId}`}
          name="label"
          required
          maxLength={120}
          onChange={(event) =>
            event.currentTarget.setCustomValidity(
              event.currentTarget.value.trim()
                ? ''
                : 'Enter an item name.',
            )
          }
        />

        <label htmlFor={`quantity-${room.roomId}`}>Quantity</label>

        <input
          id={`quantity-${room.roomId}`}
          name="quantity"
          type="number"
          min="1"
          max="999"
          step="1"
          defaultValue="1"
          required
        />

        <label htmlFor={`volume-${room.roomId}`}>
          Volume per item (m³, optional)
        </label>

        <input
          id={`volume-${room.roomId}`}
          name="volume"
          type="number"
          min="0.01"
          max="1000"
          step="0.01"
          aria-describedby={`volume-help-${room.roomId}`}
        />

        <p
          id={`volume-help-${room.roomId}`}
          className="form-help"
        >
          Leave blank if unknown. We will flag the total as incomplete.
        </p>

        <p className="form-help">
          Added items are included in your move.
        </p>

        <div className="form-actions">
          <button type="submit">Add item</button>

          <button
            type="button"
            onClick={() => {
              if (detailsRef.current) {
                detailsRef.current.open = false
              }
              summaryRef.current?.focus()
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </details>
  )
}

function InventoryHeader({ loaded = false }: { loaded?: boolean }) {
  return (
    <header className="page-header">
      <h1 id="inventory-title" tabIndex={-1}>
        Your inventory
      </h1>

      {loaded && (
        <>
          <p>
            Check what’s coming with you. Add anything we missed and
            remove anything staying behind.
          </p>

          <p className="review-help">
            Start with items marked “Needs review”: check the item name
            and quantity.
          </p>
        </>
      )}
    </header>
  )
}

function FakeNavbar() {
  return (
    <div className="fake-navbar">
      <img
        className="brand-logo"
        src={movinLogo}
        width="148"
        height="36"
        alt="MOVIN"
      />

      <p className="eyebrow">Your move</p>
    </div>
  )
}

function App() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadState, setLoadState] =
    useState<'loading' | 'ready' | 'error'>('loading')

  const [attempt, setAttempt] = useState(0)

  const [demo] = useState(
    () => new URLSearchParams(window.location.search).get('demo'),
  )

  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null)

  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [message, setMessage] = useState('')

  // Fotos añadidas manualmente por el cliente.
  const [itemPhotos, setItemPhotos] =
    useState<Record<string, string>>({})

  const confirmationHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (demo === 'error' && attempt === 0) {
        setLoadState('error')
        return
      }

      setRooms(
        inventory.rooms.map((room) => ({
          ...room,
          items: demo === 'empty' ? [] : room.items,
        })),
      )

      setLoadState('ready')
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [demo, attempt])

  useEffect(() => {
    if (confirmation) {
      confirmationHeading.current?.focus()

      confirmationHeading.current?.scrollIntoView({
        block: 'start',
      })
    }
  }, [confirmation])

  useEffect(() => {
    if (attempt > 0 && loadState === 'ready') {
      document.getElementById('inventory-title')?.focus()
    }
  }, [attempt, loadState])

  function toggleRemoval(item: InventoryItem, roomName: string) {
    setConfirmation(null)

    const isRemoved = removedIds.includes(item.id)

    setRemovedIds((ids) =>
      isRemoved
        ? ids.filter((id) => id !== item.id)
        : [...ids, item.id],
    )

    setMessage(
      `${item.label} ${
        isRemoved ? 'restored to' : 'removed from'
      } ${roomName}.`,
    )
  }

  function addItem(roomId: string, item: InventoryItem) {
    setConfirmation(null)

    setRooms((current) =>
      current.map((room) =>
        room.roomId === roomId
          ? {
              ...room,
              items: [...room.items, item],
            }
          : room,
      ),
    )

    setMessage(
      `${item.label} added to ${
        rooms.find((room) => room.roomId === roomId)?.name
      }.`,
    )
  }

  function changeQuantity(
    roomId: string,
    itemId: string,
    change: number,
  ) {
    setConfirmation(null)

    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.roomId !== roomId
          ? room
          : {
              ...room,
              items: room.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      quantity: Math.min(
                        999,
                        Math.max(1, item.quantity + change),
                      ),
                    },
              ),
            },
      ),
    )
  }

  function addPhoto(itemId: string, file?: File) {
    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      setItemPhotos((current) => ({
        ...current,
        [itemId]: String(reader.result),
      }))

      setMessage('Photo added.')
    }

    reader.readAsDataURL(file)
  }

  const movingItems = rooms
    .flatMap((room) => room.items)
    .filter(
      (item) =>
        item.movable && !removedIds.includes(item.id),
    )

  const knownVolume = movingItems.reduce(
    (total, item) =>
      total +
      (item.volumeM3 === null
        ? 0
        : item.quantity * item.volumeM3),
    0,
  )

  const unknownQuantity = movingItems.reduce(
    (total, item) =>
      total +
      (item.volumeM3 === null ? item.quantity : 0),
    0,
  )

  function confirmInventory() {
    const roundedVolume = Number(knownVolume.toFixed(2))

    setConfirmation({
      propertyId: inventory.propertyId,
      confirmedAt: new Date().toISOString(),

      rooms: rooms.map((room) => ({
        ...room,
        items: room.items.filter(
          (item) =>
            item.movable && !removedIds.includes(item.id),
        ),
      })),

      knownVolumeM3: roundedVolume,

      totalVolumeM3:
        unknownQuantity > 0 ? null : roundedVolume,

      itemsWithoutVolume: unknownQuantity,
    })
  }

  if (loadState !== 'ready') {
    return (
      <main className="inventory-shell">
        <div className="inventory-scroll">
          <FakeNavbar />

          <div className="inventory-page">
            <InventoryHeader />

            {loadState === 'loading' ? (
              <section className="state-panel">
                <p role="status">Loading your inventory…</p>
              </section>
            ) : (
              <section className="state-panel">
                <h2>We couldn’t load your inventory</h2>

                <p role="alert">
                  Your items are unavailable right now. Please try
                  again.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setLoadState('loading')
                    setAttempt((value) => value + 1)
                  }}
                >
                  Try again
                </button>
              </section>
            )}
          </div>
        </div>

        <aside
          className="volume-summary"
          aria-label="Moving volume"
        >
          <div className="volume-summary-content">
            <p>Moving volume</p>

            <p>
              {loadState === 'loading'
                ? 'Waiting for inventory…'
                : 'Unavailable until inventory loads'}
            </p>
          </div>
        </aside>
      </main>
    )
  }

  return (
    <main className="inventory-shell">
      <div className="inventory-scroll">
        <FakeNavbar />

        <div className="inventory-page">
          <InventoryHeader loaded />

          <p className="action-message" role="status">
            {message}
          </p>

          {confirmation && (
            <section
              className="confirmation-panel"
              aria-labelledby="confirmation-heading"
            >
              <h2
                id="confirmation-heading"
                ref={confirmationHeading}
                tabIndex={-1}
              >
                Inventory confirmation preview
              </h2>

              <p>
                This is what would be submitted. Nothing has been
                sent.
              </p>

              <p>
                <strong>
                  {confirmation.totalVolumeM3 === null
                    ? 'Known volume'
                    : 'Total volume'}
                  :{' '}
                  {volumeFormat.format(
                    confirmation.knownVolumeM3,
                  )}{' '}
                  m³
                </strong>
              </p>

              {confirmation.itemsWithoutVolume > 0 && (
                <p>
                  {confirmation.itemsWithoutVolume}{' '}
                  {confirmation.itemsWithoutVolume === 1
                    ? 'item still needs'
                    : 'items still need'}{' '}
                  a volume estimate. This is not a complete volume
                  estimate.
                </p>
              )}

              {confirmation.rooms.map((room) => (
                <div
                  className="confirmation-room"
                  key={room.roomId}
                >
                  <h3>{room.name}</h3>

                  {room.items.length === 0 ? (
                    <p>No items included in the move.</p>
                  ) : (
                    <ul>
                      {room.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity} × {item.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <p>
                Removed items and items staying in the property are
                excluded. Any edit clears this preview so you can
                confirm the updated inventory.
              </p>
            </section>
          )}

          {rooms.every((room) =>
            room.items.every((item) =>
              removedIds.includes(item.id),
            ),
          ) && (
            <section
              className="state-panel"
              aria-labelledby="empty-heading"
            >
              <h2 id="empty-heading">
                Your inventory is empty
              </h2>

              <p>
                Add any items you are moving using the room sections
                below, or confirm an empty inventory.
              </p>
            </section>
          )}

          <div className="room-list">
            {rooms.map((room) => (
              <section
                className="room"
                key={room.roomId}
                aria-labelledby={`heading-${room.roomId}`}
              >
                <header className="room-header">
                  <h2 id={`heading-${room.roomId}`}>
                    {room.name}
                  </h2>

                  <p>
                    {room.photoCount}{' '}
                    {room.photoCount === 1
                      ? 'photo'
                      : 'photos'}
                  </p>
                </header>

                {room.items.every((item) =>
                  removedIds.includes(item.id),
                ) && (
                  <p className="empty-room">
                    No items in this room. Add anything we missed.
                  </p>
                )}

                {room.items.length > 0 && (
                  <ul className="item-list">
                    {room.items.map((item) => {
                      const isRemoved = removedIds.includes(item.id)

                      return (
                        <li
                          className={`inventory-item${
                            isRemoved ? ' removed-item' : ''
                          }`}
                          key={item.id}
                        >
                          <div className="item-card-layout">
                            <label
                              className="item-photo-box"
                              title={`Add photo for ${item.label}`}
                            >
                              {itemPhotos[item.id] ? (
                                <img
                                  src={itemPhotos[item.id]}
                                  alt={`Preview of ${item.label}`}
                                />
                              ) : (
                                <span className="item-photo-placeholder">
                                  <span
                                    className="photo-plus"
                                    aria-hidden="true"
                                  >
                                    +
                                  </span>

                                  <span>Add photo</span>
                                </span>
                              )}

                              <input
                                className="item-photo-input"
                                type="file"
                                accept="image/*"
                                aria-label={`Add photo for ${item.label}`}
                                onChange={(event) =>
                                  addPhoto(
                                    item.id,
                                    event.target.files?.[0],
                                  )
                                }
                              />
                            </label>

                            <div className="item-content">
                              <div className="item-heading">
                                <h3>{item.label}</h3>

                                {!isRemoved &&
                                  item.confidence !== null &&
                                  item.confidence <
                                    REVIEW_THRESHOLD && (
                                    <span className="review-badge">
                                      <span aria-hidden="true">
                                        ⚠
                                      </span>
                                      Needs review
                                    </span>
                                  )}
                              </div>

                              {isRemoved ? (
                                <>
                                  <p className="item-note">
                                    Removed from inventory
                                  </p>

                                  <button
                                    className="remove-button"
                                    type="button"
                                    aria-label={`Undo removal of ${item.label} in ${room.name}`}
                                    onClick={() =>
                                      toggleRemoval(
                                        item,
                                        room.name,
                                      )
                                    }
                                  >
                                    Undo
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="item-volume">
                                    {item.volumeM3 === null
                                      ? 'Volume estimate unavailable'
                                      : `${volumeFormat.format(
                                          item.volumeM3,
                                        )} m³ per item`}
                                  </p>

                                  <div className="item-bottom-row">
                                    <div className="compact-quantity">
                                      <span className="quantity-label">
                                        Quantity
                                      </span>

                                      <div className="quantity-control">
                                        <button
                                          type="button"
                                          aria-label={`Decrease quantity of ${item.label} in ${room.name}`}
                                          disabled={
                                            item.quantity <= 1
                                          }
                                          onClick={() =>
                                            changeQuantity(
                                              room.roomId,
                                              item.id,
                                              -1,
                                            )
                                          }
                                        >
                                          −
                                        </button>

                                        <span
                                          aria-live="polite"
                                          aria-atomic="true"
                                        >
                                          {item.quantity}
                                        </span>

                                        <button
                                          type="button"
                                          aria-label={`Increase quantity of ${item.label} in ${room.name}`}
                                          disabled={
                                            item.quantity >= 999
                                          }
                                          onClick={() =>
                                            changeQuantity(
                                              room.roomId,
                                              item.id,
                                              1,
                                            )
                                          }
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    <button
                                      className="remove-button"
                                      type="button"
                                      aria-label={`Remove ${item.label} in ${room.name}`}
                                      onClick={() =>
                                        toggleRemoval(
                                          item,
                                          room.name,
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  {!item.movable && (
                                    <p className="item-note">
                                      Not included in move · stays in
                                      the property
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <AddItemForm
                  room={room}
                  onAdd={(item) =>
                    addItem(room.roomId, item)
                  }
                />
              </section>
            ))}
          </div>
        </div>
      </div>

      <aside
        className="volume-summary"
        aria-label="Moving volume"
      >
        <div className="volume-summary-content">
          <div aria-live="polite" aria-atomic="true">
            <p>
              {unknownQuantity > 0
                ? 'Known volume'
                : 'Total volume'}
            </p>

            <p className="volume-value">
              {volumeFormat.format(knownVolume)} m³
            </p>

            {unknownQuantity > 0 && (
              <p className="volume-warning">
                {unknownQuantity}{' '}
                {unknownQuantity === 1
                  ? 'item needs'
                  : 'items need'}{' '}
                a volume estimate · Total is incomplete
              </p>
            )}
          </div>

          <button
            className="confirm-button"
            type="button"
            onClick={confirmInventory}
          >
            Confirm inventory
          </button>
        </div>
      </aside>
    </main>
  )
}

export default App