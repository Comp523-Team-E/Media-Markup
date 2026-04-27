# User Documentation 

## Table of Contents

- [Functionality](#functionality)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Supported Audio Formats](#supported-audio-file-formats)
- [Other Features](#other-supported-features)

## Functionality 

When the app is first opened the user is presented with a dialog that allows them to select an audio file. The supported audio file formats can be found [here](#supported-audio-file-formats). After the user has selected an audio file, they are presented with the application's main user interface. This interface has four main components:

- [Waveform Diagram](#waveform-diagram)
- [Marker List](#marker-list)
- [Segment List](#segment-list)
- [Shortcut list](#shortcut-list)

### Waveform Diagram

The waveform diagram shows the user the waveform for their uploaded audio files. The user can zoom in on the waveform diagram using the shortcuts to place markers more precisely.

Below the waveform diagram is a series of buttons for playing/pausing the audio, jumping forward/backward, and two toggles: loop and follow. The loop toggle, when enabled, will make the audio play on a loop. If the playhead reaches the end of the audio file it will automatically return to the start of the audio file and continue playing. The follow toggle forces the waveform diagram to move with the playhead (and vice versa) when the waveform is zoomed in. Both of these toggles default to being turned off. 

### Marker List 

In the bottom left of the main user interface the markers created by the user, along with their timestamps and types, are listed. As the user adds markers to the audio file, they will be displayed here. next to each marker is a colored dot to make it easier to identify the type of the marker.

The type of each marker is either start, start/end, or end. The reason for start and end markers is intuitive, but the use case for start/end markers may be less obvious. Start/end markers are used to provide a matching end to a previous start marker while also creating a new start marker at the same position. This is ideal for use cases where there is no noticable time gap between segments. 

The edit button can be selected for any marker and the appropriate keyboard shortcuts (referenced in the [keyboard shortcuts](#keyboard-shortcuts) section) used to fine tune a markers position. Likewise, the delete button next to each marker can be used to delete a marker. 

### Segment List 

In the segment list the user can see all of the valid segments formed by the currently added markers. When the user exports the audio segments there will be one audio segment exported for each segment listed in this section. If the current marker arrangement is invalid (there is not a matching end marker for every start) then a red error message will be listed in this section with the reason. the start and end time stamp for each segment is listed and segments can also be provided with a name that will be used for naming the output audio files and used in the exported CSV. 

### Shortcut List 

This section lists all of the shortcuts provided to the user for easy reference. Some shortcuts, such as the seek shortcut used by the arrow keys, can be configured to use different values or timesteps. Refer to the [Keyboard Shortcuts](shortcuts.md) page for a comprehensive list of the available shortcuts as well as instructions on how to modify their bindings. 

## Supported Audio File Formats

- MP3 (`.mp3`)
- MP4 (`.mp4`)
- WAV (`.wav`)
- FLAC (`.flac`)
- OGG (`.ogg`)
- AAC (`.aac`)
- M4A (`.m4a`)

## Other Supported Features

In addition to the base functionality listed above there are a few other features for importing and exporting files from the app that we have made available. 

The first feature we would like to highlight is that when users have finished placing their markers and are ready to export they can choose to either export the audio segments, the CSV with all of segments, or both. If the user chooses to export the CSV with all of their markers they will be able to pick up progress in another session by clicking the import CSV button in the top right and selecting the CSV file. 

Users can also select the Open File button to import a new audio file and reset the applications state. Be weary that if a new audio file is opened without first exporting the current progress then that progress will not be saved. 