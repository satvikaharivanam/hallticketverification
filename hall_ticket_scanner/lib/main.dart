import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(HallTicketScannerApp());
}

class HallTicketScannerApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hall Ticket Scanner',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: SubjectSelectorPage(),
    );
  }
}

class SubjectSelectorPage extends StatefulWidget {
  @override
  _SubjectSelectorPageState createState() => _SubjectSelectorPageState();
}

class _SubjectSelectorPageState extends State<SubjectSelectorPage> {
  List<String> subjects = [];
  String? selectedSubject;

  @override
  void initState() {
    super.initState();
    _fetchSubjects();
  }

  Future<void> _fetchSubjects() async {
    try {
      final response = await http.get(Uri.parse('http://192.168.0.225:5000/api/subjects'));
      if (response.statusCode == 200) {
        setState(() {
          subjects = List<String>.from(json.decode(response.body));
        });
      } else {
        debugPrint('Failed to fetch subjects, status: ${response.statusCode}, body: ${response.body}');
        throw Exception('Failed to load subjects');
      }
    } catch (e) {
      debugPrint('Error fetching subjects: $e');
      setState(() {
        subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology']; // Fallback list
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Select Subject')),
      body: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('Choose the subject to start scanning:', style: TextStyle(fontSize: 16)),
          SizedBox(height: 20),
          DropdownButton<String>(
            value: selectedSubject,
            hint: Text('Select a subject'),
            onChanged: (value) {
              setState(() {
                selectedSubject = value;
              });
            },
            items: subjects.map((subject) {
              return DropdownMenuItem<String>(
                value: subject,
                child: Text(subject),
              );
            }).toList(),
          ),
          SizedBox(height: 20),
          ElevatedButton(
            onPressed: selectedSubject == null
                ? null
                : () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => QRScannerPage(subject: selectedSubject!),
                      ),
                    );
                  },
            child: Text('Start Scanning'),
          ),
        ],
      ),
    );
  }
}

class QRScannerPage extends StatefulWidget {
  final String subject;

  QRScannerPage({required this.subject});

  @override
  _QRScannerPageState createState() => _QRScannerPageState();
}

class _QRScannerPageState extends State<QRScannerPage> {
  final MobileScannerController _controller = MobileScannerController();
  bool _isScanning = true;

  void _onScan(BarcodeCapture barcodeCapture) async {
    if (!_isScanning || barcodeCapture.barcodes.isEmpty) return;
    setState(() => _isScanning = false);
    debugPrint('📸 QR Code Detected!');
    try {
      final raw = barcodeCapture.barcodes.first.rawValue;
      debugPrint('📦 Raw QR Data: $raw');
      if (raw == null) {
        debugPrint('❌ Raw data is null');
        _showDialog('Error', 'Invalid QR Code');
        return;
      }
      final qrData = json.decode(raw);
      debugPrint('📋 Decoded QR Data: $qrData');
      final rollNumber = qrData['rollNumber'];
      if (rollNumber == null) {
        debugPrint('❌ No rollNumber in QR data');
        _showDialog('Error', 'Invalid QR Code data');
        return;
      }
      debugPrint('🔍 Sending to server: rollNumber=$rollNumber, subject=${widget.subject}');
      final response = await http.post(
        Uri.parse('http://192.168.0.225:5000/api/mark-attendance'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'rollNumber': rollNumber, 'subject': widget.subject}),
      );
      debugPrint('📡 Server response: ${response.statusCode}, ${response.body}');
      if (response.statusCode == 200) {
        debugPrint('✅ Attendance marked');
        final body = json.decode(response.body);
        final message = body['message'];
        final today = DateTime.now().toIso8601String().split('T')[0];
        _showDialog('Success', '$message\nCSV file created/updated at: /uploads/${today}_${widget.subject}.csv');
      } else {
        debugPrint('❌ Server error: ${response.statusCode}, ${response.body}');
        _showDialog('Error', 'Server error: ${response.body}');
      }
    } catch (e) {
      debugPrint('❌ Scan error: $e');
      _showDialog('Error', 'Invalid QR or system error.');
    } finally {
      setState(() => _isScanning = true);
    }
  }

  void _showDialog(String title, String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Text(message)),
        actions: [
          TextButton(
            child: Text('OK'),
            onPressed: () {
              Navigator.of(dialogContext).pop();
              setState(() {}); // Force UI refresh
            },
          ),
        ],
      ),
    );
  }

  void _changeSubject() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => SubjectSelectorPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Scanner - ${widget.subject}'),
        actions: [
          IconButton(
            icon: Icon(Icons.edit),
            tooltip: 'Change Subject',
            onPressed: _changeSubject,
          ),
        ],
      ),
      body: Center(
        child: MobileScanner(
          controller: _controller,
          onDetect: _onScan,
        ),
      ),
    );
  }
}