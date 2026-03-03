import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../contexts/ThemeContext';

interface CommonHeaderProps {
  title: string;
  onBackPress?: () => void;
  rightButtonText?: string;
  onRightButtonPress?: () => void;
  showBackButton?: boolean;
  showRightButton?: boolean;
}

const CommonHeader: React.FC<CommonHeaderProps> = ({
  title,
  onBackPress,
  rightButtonText = 'Save',
  onRightButtonPress,
  showBackButton = true,
  showRightButton = false,
}) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
      <View style={styles.headerContent}>
        {showBackButton ? (
          <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
            <Icon name="chevron-left" size={28} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
        
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
        
        {showRightButton ? (
          <TouchableOpacity onPress={onRightButtonPress} style={styles.rightButton}>
            <Text style={[styles.rightButtonText, { color: colors.accent }]}>{rightButtonText}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    padding: 4,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  rightButton: {
    padding: 4,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  rightButtonText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '400',
  },
  placeholder: {
    width: 60,
  },
});

export default CommonHeader;
