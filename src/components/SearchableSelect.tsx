import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  emptyMessage?: string
  loadingMessage?: string
  theme?: 'dark' | 'light'
  className?: string
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  isLoading = false,
  emptyMessage = 'No options available',
  loadingMessage = 'Loading...',
  theme = 'light',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsListRef = useRef<HTMLDivElement>(null)

  // Filter options based on search query
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Get the selected option label
  const selectedOption = options.find(opt => opt.value === value)
  const displayValue = selectedOption ? selectedOption.label : ''

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
        setHighlightedIndex(-1)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // Focus search input when dropdown opens
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 0)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex(prev => {
          const next = prev < filteredOptions.length - 1 ? prev + 1 : prev
          scrollToOption(next)
          return next
        })
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0
          scrollToOption(next)
          return next
        })
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex].value)
        }
      } else if (event.key === 'Escape') {
        setIsOpen(false)
        setSearchQuery('')
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, filteredOptions, highlightedIndex])

  const scrollToOption = (index: number) => {
    if (optionsListRef.current) {
      const optionElement = optionsListRef.current.children[index] as HTMLElement
      if (optionElement) {
        optionElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue)
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  const handleToggle = () => {
    if (!disabled && !isLoading) {
      setIsOpen(!isOpen)
      if (!isOpen) {
        setSearchQuery('')
        setHighlightedIndex(-1)
      }
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setSearchQuery('')
  }

  const baseInputClasses = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
    theme === 'dark'
      ? 'input-gradient border-gradient-accent'
      : 'border-gray-300 bg-white'
  } ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected value display / trigger */}
      <div
        onClick={handleToggle}
        className={`${baseInputClasses} flex items-center justify-between ${
          !disabled && !isLoading ? 'hover:border-green-400' : ''
        }`}
      >
        <span className={`truncate ${!displayValue ? 'text-gray-400' : ''}`}>
          {displayValue || placeholder}
        </span>
        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-0.5 rounded transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-gray-700'
                  : 'hover:bg-gray-200'
              }`}
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={`absolute z-50 w-full mt-1 rounded-md shadow-lg border ${
            theme === 'dark'
              ? 'bg-gradient-highlight border-gradient-accent'
              : 'bg-white border-gray-200'
          } max-h-64 overflow-hidden flex flex-col`}
        >
          {/* Search input */}
          <div className={`p-2 border-b ${
            theme === 'dark'
              ? 'border-gradient-accent'
              : 'border-gray-200'
          }`}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setHighlightedIndex(-1)
                }}
                placeholder="Search..."
                className={`w-full pl-8 pr-2 py-1.5 text-sm rounded border ${
                  theme === 'dark'
                    ? 'bg-gradient-accent border-gradient-accent text-gradient-primary placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
            </div>
          </div>

          {/* Options list */}
          <div
            ref={optionsListRef}
            className="overflow-y-auto max-h-48"
          >
            {isLoading ? (
              <div
                className={`px-3 py-2 text-sm ${
                  theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'
                }`}
              >
                {loadingMessage}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div
                className={`px-3 py-2 text-sm ${
                  theme === 'dark' ? 'text-gradient-secondary' : 'text-gray-500'
                }`}
              >
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === value
                const isHighlighted = index === highlightedIndex

                return (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                      isSelected
                        ? theme === 'dark'
                          ? 'bg-gradient-accent text-gradient-primary font-medium'
                          : 'bg-green-50 text-green-700 font-medium'
                        : isHighlighted
                        ? theme === 'dark'
                          ? 'bg-gradient-accent text-gradient-primary'
                          : 'bg-gray-100 text-gray-900'
                        : theme === 'dark'
                        ? 'text-gradient-secondary hover:bg-gradient-accent hover:text-gradient-primary'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {option.label}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect

