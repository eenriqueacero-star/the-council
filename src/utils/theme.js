export function theme(dark) {
  return {
    bg:               dark ? '#111111' : '#FFFFFF',
    bgCard:           dark ? '#1C1C1E' : '#F7F7F7',
    bgHover:          dark ? '#2C2C2E' : '#F0F0F0',
    border:           dark ? '#2C2C2E' : '#EEEEEE',
    text:             dark ? '#F2F2F7' : '#000000',
    text2:            dark ? '#8E8E93' : '#757575',
    text3:            dark ? '#555555' : '#AAAAAA',
    input:            dark ? '#1C1C1E' : '#FFFFFF',
    inputBorder:      dark ? '#3A3A3C' : '#EEEEEE',
    inputFocus:       dark ? '#F2F2F7' : '#000000',
    btnDisabled:      dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
    btnDisabledText:  dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.30)',
    skeleton:         dark ? '#2C2C2E' : '#F0F0F0',
  };
}
