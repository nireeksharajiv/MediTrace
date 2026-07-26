class Medicine {
  const Medicine({
    required this.gtin,
    required this.medicineName,
    required this.manufacturer,
    required this.batchNumber,
    required this.manufacturingDate,
    required this.expiryDate,
    required this.dosage,
    required this.status,
    required this.description,
    this.serialNumber = 'N/A',
    this.medicineId = 'N/A',
  });

  final String gtin;
  final String medicineName;
  final String manufacturer;
  final String batchNumber;
  final String manufacturingDate;
  final String expiryDate;
  final String dosage;
  final String status;
  final String description;
  final String serialNumber;
  final String medicineId;

  factory Medicine.fromJson(Map<String, dynamic> json) {
    return Medicine(
      gtin: json['gtin']?.toString() ?? '',
      medicineName: json['medicineName']?.toString() ?? 'Not available',
      manufacturer: json['manufacturer']?.toString() ?? 'Not available',
      batchNumber: json['batchNumber']?.toString() ?? 'Not available',
      manufacturingDate: json['manufacturingDate']?.toString() ?? 'Not available',
      expiryDate: json['expiryDate']?.toString() ?? 'Not available',
      dosage: json['dosage']?.toString() ?? 'Not available',
      status: json['status']?.toString() ?? 'Not available',
      description: json['description']?.toString() ?? 'Not available',
      serialNumber: json['serialNumber']?.toString() ?? 'N/A',
      medicineId: json['medicineId']?.toString() ?? json['gtin']?.toString() ?? 'N/A',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'gtin': gtin,
      'medicineName': medicineName,
      'manufacturer': manufacturer,
      'batchNumber': batchNumber,
      'manufacturingDate': manufacturingDate,
      'expiryDate': expiryDate,
      'dosage': dosage,
      'status': status,
      'description': description,
      'serialNumber': serialNumber,
      'medicineId': medicineId,
    };
  }

  Medicine copyWith({
    String? gtin,
    String? medicineName,
    String? manufacturer,
    String? batchNumber,
    String? manufacturingDate,
    String? expiryDate,
    String? dosage,
    String? status,
    String? description,
    String? serialNumber,
    String? medicineId,
  }) {
    return Medicine(
      gtin: gtin ?? this.gtin,
      medicineName: medicineName ?? this.medicineName,
      manufacturer: manufacturer ?? this.manufacturer,
      batchNumber: batchNumber ?? this.batchNumber,
      manufacturingDate: manufacturingDate ?? this.manufacturingDate,
      expiryDate: expiryDate ?? this.expiryDate,
      dosage: dosage ?? this.dosage,
      status: status ?? this.status,
      description: description ?? this.description,
      serialNumber: serialNumber ?? this.serialNumber,
      medicineId: medicineId ?? this.medicineId,
    );
  }
}
