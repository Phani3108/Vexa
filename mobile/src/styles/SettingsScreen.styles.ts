import { StyleSheet } from 'react-native';

const SettingsScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  section: {
    marginTop: 28,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  // Two-line row (label + value)
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    minHeight: 60,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 2,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  // Single-line nav row label
  navRowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    flex: 1,
  },
  // Badge pill (e.g. "ON", "3")
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 66,
  },
  // Quick DND Toggle
  quickToggleSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  quickToggleButton: {
    backgroundColor: '#636366',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  quickToggleButtonActive: {
    backgroundColor: '#FF3B30',
  },
  quickToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dndIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  quickToggleTextContainer: {
    flex: 1,
  },
  quickToggleTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  quickToggleSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  quickToggleIcon: {
    marginRight: 12,
  },
  // Logout
  resetButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  resetText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FF3B30',
  },
  // Legacy / unused (kept to avoid missing style errors)
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    lineHeight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  syncButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  syncLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 12,
  },
  syncTime: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#22223b',
  },
  button: {
    backgroundColor: '#4a4e69',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default SettingsScreenStyles;
