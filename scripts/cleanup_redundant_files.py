"""
Cleanup Script for Nephro-AI Project
Removes redundant files after folder structure reorganization
"""
import os
import shutil
from pathlib import Path
from datetime import datetime

class ProjectCleanup:
    def __init__(self):
        self.base_dir = Path("e:/Y4S1/Final Year Research Project/Nephro-AI")
        self.processed_dir = self.base_dir / "data" / "processed"
        self.deleted_files = []
        self.deleted_dirs = []
        self.errors = []
        
    def backup_list_to_file(self):
        """Create a backup list of files to be deleted"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = self.base_dir / f"deleted_files_backup_{timestamp}.txt"
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            f.write("=" * 70 + "\n")
            f.write("NEPHRO-AI CLEANUP - FILES TO BE DELETED\n")
            f.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 70 + "\n\n")
            
            # List all files that will be deleted
            vectordb_files = list(self.processed_dir.glob("*_vectordb_ready.json"))
            summary_files = list(self.processed_dir.glob("*_preparation_summary.json"))
            
            f.write(f"1. VectorDB Ready Files ({len(vectordb_files)}):\n")
            for file in vectordb_files:
                f.write(f"   - {file.name}\n")
            
            f.write(f"\n2. Preparation Summary Files ({len(summary_files)}):\n")
            for file in summary_files:
                f.write(f"   - {file.name}\n")
            
            f.write("\n3. Old Tracker and Query Files:\n")
            f.write("   - .processed_chunks_tracker.json\n")
            f.write("   - sample_queries.txt\n")
            f.write("   - vectordb_preparation_summary.json\n")
            f.write("   - vectordb_ready_chunks.json\n")
            
            f.write("\n4. Root Directory Documentation Files:\n")
            f.write("   - COMPLETION_REPORT.md\n")
            f.write("   - CT.txt\n")
            f.write("   - FINAL_SUCCESS_SUMMARY.md\n")
            f.write("   - VECTORDB_BUILD_COMPLETE.md\n")
            
        print(f"✅ Backup list created: {backup_file.name}")
        return backup_file
    
    def remove_vectordb_ready_files(self):
        """Remove *_vectordb_ready.json files from data/processed"""
        print("\n" + "=" * 70)
        print("STEP 1: Removing VectorDB Ready Files")
        print("=" * 70)
        
        files = list(self.processed_dir.glob("*_vectordb_ready.json"))
        print(f"Found {len(files)} files to delete...")
        
        for file in files:
            try:
                file.unlink()
                self.deleted_files.append(str(file))
                print(f"  ✓ Deleted: {file.name}")
            except Exception as e:
                self.errors.append(f"Failed to delete {file.name}: {str(e)}")
                print(f"  ✗ Error: {file.name} - {str(e)}")
        
        print(f"✅ Deleted {len(files)} vectordb_ready files")
    
    def remove_preparation_summary_files(self):
        """Remove *_preparation_summary.json files from data/processed"""
        print("\n" + "=" * 70)
        print("STEP 2: Removing Preparation Summary Files")
        print("=" * 70)
        
        files = list(self.processed_dir.glob("*_preparation_summary.json"))
        print(f"Found {len(files)} files to delete...")
        
        for file in files:
            try:
                file.unlink()
                self.deleted_files.append(str(file))
                print(f"  ✓ Deleted: {file.name}")
            except Exception as e:
                self.errors.append(f"Failed to delete {file.name}: {str(e)}")
                print(f"  ✗ Error: {file.name} - {str(e)}")
        
        print(f"✅ Deleted {len(files)} preparation_summary files")
    
    def remove_old_tracking_files(self):
        """Remove old tracking and query files"""
        print("\n" + "=" * 70)
        print("STEP 3: Removing Old Tracking Files")
        print("=" * 70)
        
        old_files = [
            self.processed_dir / ".processed_chunks_tracker.json",
            self.processed_dir / "sample_queries.txt",
            self.processed_dir / "vectordb_preparation_summary.json",
            self.processed_dir / "vectordb_ready_chunks.json"
        ]
        
        for file in old_files:
            if file.exists():
                try:
                    file.unlink()
                    self.deleted_files.append(str(file))
                    print(f"  ✓ Deleted: {file.name}")
                except Exception as e:
                    self.errors.append(f"Failed to delete {file.name}: {str(e)}")
                    print(f"  ✗ Error: {file.name} - {str(e)}")
            else:
                print(f"  ℹ Already removed: {file.name}")
    
    def remove_redundant_docs(self):
        """Remove redundant documentation files from root"""
        print("\n" + "=" * 70)
        print("STEP 4: Removing Redundant Documentation Files")
        print("=" * 70)
        
        redundant_docs = [
            self.base_dir / "COMPLETION_REPORT.md",
            self.base_dir / "CT.txt",
            self.base_dir / "FINAL_SUCCESS_SUMMARY.md",
            self.base_dir / "VECTORDB_BUILD_COMPLETE.md"
        ]
        
        for file in redundant_docs:
            if file.exists():
                try:
                    file.unlink()
                    self.deleted_files.append(str(file))
                    print(f"  ✓ Deleted: {file.name}")
                except Exception as e:
                    self.errors.append(f"Failed to delete {file.name}: {str(e)}")
                    print(f"  ✗ Error: {file.name} - {str(e)}")
            else:
                print(f"  ℹ File not found: {file.name}")
    
    def cleanup_pycache(self):
        """Remove __pycache__ directories"""
        print("\n" + "=" * 70)
        print("STEP 5: Cleaning Python Cache")
        print("=" * 70)
        
        pycache_dirs = list(self.base_dir.rglob("__pycache__"))
        
        for pycache in pycache_dirs:
            try:
                shutil.rmtree(pycache)
                self.deleted_dirs.append(str(pycache))
                print(f"  ✓ Removed: {pycache.relative_to(self.base_dir)}")
            except Exception as e:
                self.errors.append(f"Failed to remove {pycache}: {str(e)}")
                print(f"  ✗ Error: {pycache} - {str(e)}")
    
    def generate_summary_report(self):
        """Generate cleanup summary report"""
        print("\n" + "=" * 70)
        print("CLEANUP SUMMARY")
        print("=" * 70)
        
        print(f"\n📊 Statistics:")
        print(f"   Files Deleted: {len(self.deleted_files)}")
        print(f"   Directories Deleted: {len(self.deleted_dirs)}")
        print(f"   Errors: {len(self.errors)}")
        
        if self.errors:
            print(f"\n⚠️  Errors encountered:")
            for error in self.errors:
                print(f"   - {error}")
        else:
            print(f"\n✅ All cleanup operations completed successfully!")
        
        # Save detailed report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.base_dir / f"cleanup_report_{timestamp}.txt"
        
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write("=" * 70 + "\n")
            f.write("NEPHRO-AI CLEANUP REPORT\n")
            f.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 70 + "\n\n")
            
            f.write(f"Files Deleted: {len(self.deleted_files)}\n")
            for file in self.deleted_files:
                f.write(f"  - {file}\n")
            
            f.write(f"\nDirectories Deleted: {len(self.deleted_dirs)}\n")
            for dir in self.deleted_dirs:
                f.write(f"  - {dir}\n")
            
            if self.errors:
                f.write(f"\nErrors: {len(self.errors)}\n")
                for error in self.errors:
                    f.write(f"  - {error}\n")
        
        print(f"\n📄 Detailed report saved: {report_file.name}")
        
    def run(self):
        """Execute complete cleanup process"""
        print("=" * 70)
        print("NEPHRO-AI PROJECT CLEANUP")
        print("=" * 70)
        print("\nThis script will remove redundant files after folder reorganization.")
        print("\nPress ENTER to continue or Ctrl+C to cancel...")
        input()
        
        # Create backup list
        self.backup_list_to_file()
        
        # Execute cleanup steps
        self.remove_vectordb_ready_files()
        self.remove_preparation_summary_files()
        self.remove_old_tracking_files()
        self.remove_redundant_docs()
        self.cleanup_pycache()
        
        # Generate summary
        self.generate_summary_report()
        
        print("\n" + "=" * 70)
        print("✅ CLEANUP COMPLETE!")
        print("=" * 70)


if __name__ == "__main__":
    cleanup = ProjectCleanup()
    cleanup.run()
