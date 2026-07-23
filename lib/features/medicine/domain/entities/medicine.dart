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
}
