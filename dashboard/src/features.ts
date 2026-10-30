// The supported_features bits the dashboard uses, from Home Assistant's *EntityFeature enums.

export const ClimateFeature = { FAN_MODE: 8, PRESET_MODE: 16 };

export const CoverFeature = {
  OPEN: 1,
  CLOSE: 2,
  SET_POSITION: 4,
  STOP: 8,
  OPEN_TILT: 16,
  CLOSE_TILT: 32,
  SET_TILT_POSITION: 128,
};

export const FanFeature = { SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8 };

export const LightFeature = { EFFECT: 4 };

export const LockFeature = { OPEN: 1 };

export const MediaFeature = {
  PAUSE: 1,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  SELECT_SOURCE: 2048,
  PLAY: 16384,
};
