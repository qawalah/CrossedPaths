import * as FileSystem from "expo-file-system";
import { Alert } from "react-native";
import { Api } from "./api";

const MIME = { gpx: "application/gpx+xml", geojson: "application/geo+json", csv: "text/csv" };

/** Ask for a format, then save the timeline (all its sources combined) to a folder the person picks. */
export function exportTimeline(upload, toast) {
  const go = async (format) => {
    try {
      const SAF = FileSystem.StorageAccessFramework;
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      const text = await Api.exportUpload(upload.id, format);
      const day = new Date((upload.from || 0) * 1000).toISOString().slice(0, 10);
      const name = `crosspaths-timeline-${day}`;
      const uri = await SAF.createFileAsync(perm.directoryUri, name, MIME[format]);
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      toast(`Saved ${name}.${format}`);
    } catch (e) {
      toast(e.message || "Couldn't save the file", true);
    }
  };
  Alert.alert(
    "Export a copy",
    "Save your timeline (all its sources combined) as a file. GPX opens in most map and fitness apps.",
    [
      { text: "GPX", onPress: () => go("gpx") },
      { text: "GeoJSON", onPress: () => go("geojson") },
      { text: "CSV", onPress: () => go("csv") },
    ],
    { cancelable: true }
  );
}
